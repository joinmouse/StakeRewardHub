const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake v0.5.0 - withdraw test", function () {
  // 合约与代币实例
  let metaNodeStake;
  let metaNodeToken;

  // 角色地址
  let owner;
  let user1;
  let user2; // 新增测试用户（验证多用户隔离）

  // 配置常量（全大写区分）
  const ETH_LOCK_BLOCKS = 10;
  const ERC20_LOCK_BLOCKS = 20;
  const ETH_STAKE = ethers.parseEther("10.0");
  const ETH_UNSTAKE = ethers.parseEther("5.0");
  const ERC20_STAKE = ethers.parseEther("100.0");
  const ERC20_UNSTAKE = ethers.parseEther("40.0");
  const ETH_POOL_ID = 0; // 固定ETH池ID
  let erc20PoolId;

  // ======== 部署与初始化（确保测试环境一致） ========
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // 1. 部署MetaNodeToken（统一质押/奖励代币）
    const MetaNodeToken = await ethers.getContractFactory("MetaNodeToken");
    metaNodeToken = await MetaNodeToken.deploy();
    await metaNodeToken.waitForDeployment();
    const erc20Addr = await metaNodeToken.getAddress();

    // 2. 给用户1转账ERC20（满足质押需求）
    await metaNodeToken.connect(owner).transfer(user1.address, ERC20_STAKE);
    expect(await metaNodeToken.balanceOf(user1.address)).to.equal(
      ERC20_STAKE,
      "用户1初始ERC20余额错误"
    );

    // 3. 部署质押合约（适配奖励机制参数）
    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy(
      ETH_LOCK_BLOCKS,
      erc20Addr, // ETH池奖励代币地址
      100 // ETH池奖励率（万分之一精度）
    );
    await metaNodeStake.waitForDeployment();

    // 4. 添加ERC20质押池并获取ID
    await metaNodeStake.addPool(
      erc20Addr, // 质押代币地址
      ERC20_LOCK_BLOCKS,
      erc20Addr, // 奖励代币地址
      200 // ERC20池奖励率（万分之一精度）
    );
    erc20PoolId = Number(await metaNodeStake.getPoolCount()) - 1;

    // 5. 初始化奖励池（避免奖励相关报错）
    const rewardAmount = ethers.parseEther("10000");
    await metaNodeToken.transfer(await metaNodeStake.getAddress(), rewardAmount);
    await metaNodeStake.setRewardEnabled(true);

    // 6. 用户1前置操作：质押→赎回申请（为提取做准备）
    // ETH池：质押10ETH → 申请赎回5ETH
    await metaNodeStake.connect(user1).stake(ETH_POOL_ID, ETH_STAKE, { value: ETH_STAKE });
    await metaNodeStake.connect(user1).requestUnstake(ETH_POOL_ID, ETH_UNSTAKE);

    // ERC20池：授权→质押100→申请赎回40
    await metaNodeToken.connect(user1).approve(await metaNodeStake.getAddress(), ERC20_STAKE);
    await metaNodeStake.connect(user1).stake(erc20PoolId, ERC20_STAKE);
    await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, ERC20_UNSTAKE);
  });

  // ======== 辅助函数（简化重复逻辑） ========
  /**
   * 获取用户在指定池的完整数据
   * @param {number} poolId - 池ID
   * @param {Signer} user - 用户签名者
   * @returns {Promise<Object>} 用户池数据
   */
  const getUserPoolData = async (poolId, user) => {
    return metaNodeStake.users(poolId, await user.getAddress());
  };

  /**
   * 挖矿到指定解锁区块（确保过锁仓期）
   * @param {bigint} unlockAt - 解锁区块号
   * @returns {Promise<number>} 挖矿后的当前区块号
   */
  const mineToUnlockBlock = async (unlockAt) => {
    const currentBlock = await ethers.provider.getBlockNumber();
    const blocksToMine = Math.max(0, Number(unlockAt - BigInt(currentBlock)));
    if (blocksToMine > 0) {
      await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);
    }
    return await ethers.provider.getBlockNumber();
  };

  // ======== 核心测试用例 ========
  describe("ETH池提取测试", function () {
    it("锁仓期结束后应成功提取ETH（含余额验证+事件）", async function () {
      // 1. 获取用户锁仓信息
      const user = await getUserPoolData(ETH_POOL_ID, user1);
      const unlockAt = user.unlockAt;
      const lockedAmount = user.locked;
      expect(lockedAmount).to.equal(ETH_UNSTAKE, "锁仓金额与赎回申请不一致");

      // 2. 挖矿到解锁区块
      const currentBlockAfterMine = await mineToUnlockBlock(unlockAt);
      expect(currentBlockAfterMine).to.be.gte(Number(unlockAt), "未达到解锁区块");

      // 3. 记录提取前用户ETH余额
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      // 4. 执行提取操作
      const withdrawTx = await metaNodeStake.connect(user1).withdraw(ETH_POOL_ID);
      const receipt = await withdrawTx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // 5. 验证用户余额（到账金额=锁仓金额- gas成本）
      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + lockedAmount - gasCost, "ETH到账金额错误");

      // 6. 验证用户锁仓状态清空
      const userAfter = await getUserPoolData(ETH_POOL_ID, user1);
      expect(userAfter.locked).to.equal(0n, "提取后锁仓金额未清空");

      // 7. 验证事件触发（含poolId参数）
      await expect(withdrawTx)
        .to.emit(metaNodeStake, "Withdrawn")
        .withArgs(await user1.getAddress(), ETH_POOL_ID, lockedAmount);

      // 8. 打印调试日志
      console.log("ETH池提取成功日志：");
      console.log("提取金额:", ethers.formatEther(lockedAmount));
      console.log("gas成本:", ethers.formatEther(gasCost));
      console.log("实际到账:", ethers.formatEther(balanceAfter - balanceBefore));
    });

    it("锁仓期内提取应失败（拦截未解锁资金）", async function () {
      // 1. 获取解锁区块号
      const user = await getUserPoolData(ETH_POOL_ID, user1);
      const unlockAt = user.unlockAt;

      // 2. 挖矿到锁仓期内（距离解锁剩2个区块）
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToMine = Math.max(0, Number(unlockAt - BigInt(currentBlock) - 2n));
      await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);
      expect(await ethers.provider.getBlockNumber()).to.be.lt(Number(unlockAt), "已超过锁仓期");

      // 3. 尝试提取应被拒绝
      await expect(
        metaNodeStake.connect(user1).withdraw(ETH_POOL_ID)
      ).to.be.revertedWith("Withdraw: funds are still locked");

      // 4. 锁仓状态保持不变
      const userAfter = await getUserPoolData(ETH_POOL_ID, user1);
      expect(userAfter.locked).to.equal(ETH_UNSTAKE, "锁仓金额被异常修改");
    });
  });

  describe("ERC20池提取测试", function () {
    it("锁仓期结束后应成功提取ERC20（含余额验证+事件）", async function () {
      // 1. 获取用户锁仓信息
      const user = await getUserPoolData(erc20PoolId, user1);
      const unlockAt = user.unlockAt;
      const lockedAmount = user.locked;
      expect(lockedAmount).to.equal(ERC20_UNSTAKE, "锁仓金额与赎回申请不一致");

      // 2. 挖矿到解锁区块
      const currentBlockAfterMine = await mineToUnlockBlock(unlockAt);
      expect(currentBlockAfterMine).to.be.gte(Number(unlockAt), "未达到解锁区块");

      // 3. 记录提取前用户ERC20余额
      const balanceBefore = await metaNodeToken.balanceOf(user1.address);

      // 4. 执行提取操作
      const withdrawTx = await metaNodeStake.connect(user1).withdraw(erc20PoolId);

      // 5. 验证用户余额（ERC20无gas成本，全额到账）
      const balanceAfter = await metaNodeToken.balanceOf(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + lockedAmount, "ERC20到账金额错误");

      // 6. 验证用户锁仓状态清空
      const userAfter = await getUserPoolData(erc20PoolId, user1);
      expect(userAfter.locked).to.equal(0n, "提取后锁仓金额未清空");

      // 7. 验证事件触发
      await expect(withdrawTx)
        .to.emit(metaNodeStake, "Withdrawn")
        .withArgs(await user1.getAddress(), erc20PoolId, lockedAmount);

      // 8. 打印调试日志
      console.log("\nERC20池提取成功日志：");
      console.log("提取金额:", ethers.formatEther(lockedAmount));
      console.log("提取前余额:", ethers.formatEther(balanceBefore));
      console.log("提取后余额:", ethers.formatEther(balanceAfter));
    });

    it("无锁仓资金时提取应失败（拦截空提取）", async function () {
      // 1. 先提取完ERC20锁仓资金（前置操作）
      const user = await getUserPoolData(erc20PoolId, user1);
      await mineToUnlockBlock(user.unlockAt);
      await metaNodeStake.connect(user1).withdraw(erc20PoolId);

      // 2. 同一用户再次提取（无锁仓资金）
      await expect(
        metaNodeStake.connect(user1).withdraw(erc20PoolId)
      ).to.be.revertedWith("Withdraw: no locked funds");

      // 3. 非锁仓用户提取（无任何锁仓记录）
      await expect(
        metaNodeStake.connect(user2).withdraw(erc20PoolId)
      ).to.be.revertedWith("Withdraw: no locked funds");
    });
  });

  describe("多池/多用户隔离性测试", function () {
    it("ETH池提取不影响ERC20池锁仓状态（池间隔离）", async function () {
      // 1. 获取两个池的解锁信息
      const ethUser = await getUserPoolData(ETH_POOL_ID, user1);
      const erc20User = await getUserPoolData(erc20PoolId, user1);
      const ethUnlockAt = Number(ethUser.unlockAt);
      const erc20UnlockAt = Number(erc20User.unlockAt);

      // 确保ETH池先解锁（避免交叉影响）
      expect(ethUnlockAt).to.be.lte(erc20UnlockAt, "ETH池解锁应早于ERC20池");

      // 2. 挖矿到ETH池解锁区块并提取
      await mineToUnlockBlock(ethUser.unlockAt);
      await metaNodeStake.connect(user1).withdraw(ETH_POOL_ID);

      // 3. 验证当前区块未超过ERC20池解锁区块
      const currentBlockAfterEthWithdraw = await ethers.provider.getBlockNumber();
      expect(currentBlockAfterEthWithdraw).to.be.lte(erc20UnlockAt, "ERC20池已提前解锁");

      // 4. 验证ERC20池锁仓状态未变
      const updatedErc20User = await getUserPoolData(erc20PoolId, user1);
      expect(updatedErc20User.locked).to.equal(ERC20_UNSTAKE, "ERC20池锁仓状态被干扰");

      // 5. 打印隔离性日志
      console.log("\n多池隔离性日志：");
      console.log("ETH提取后当前区块:", currentBlockAfterEthWithdraw);
      console.log("ERC20池解锁区块:", erc20UnlockAt);
      console.log("ERC20池剩余锁仓量:", ethers.formatEther(updatedErc20User.locked));
    });

    it("多用户提取互不干扰（用户间隔离）", async function () {
      // 1. 用户2独立质押+赎回ETH
      const user2EthStake = ethers.parseEther("8.0");
      const user2EthUnstake = ethers.parseEther("3.0");
      await metaNodeStake.connect(user2).stake(ETH_POOL_ID, user2EthStake, { value: user2EthStake });
      await metaNodeStake.connect(user2).requestUnstake(ETH_POOL_ID, user2EthUnstake);

      // 2. 获取两个用户的解锁区块（取较大值挖矿）
      const user1Eth = await getUserPoolData(ETH_POOL_ID, user1);
      const user2Eth = await getUserPoolData(ETH_POOL_ID, user2);
      const maxUnlockAt = BigInt(Math.max(Number(user1Eth.unlockAt), Number(user2Eth.unlockAt)));
      await mineToUnlockBlock(maxUnlockAt);

      // 3. 用户1提取ETH
      await metaNodeStake.connect(user1).withdraw(ETH_POOL_ID);
      const user1After = await getUserPoolData(ETH_POOL_ID, user1);
      expect(user1After.locked).to.equal(0n, "用户1提取后锁仓未清空");

      // 4. 用户2提取ETH
      await metaNodeStake.connect(user2).withdraw(ETH_POOL_ID);
      const user2After = await getUserPoolData(ETH_POOL_ID, user2);
      expect(user2After.locked).to.equal(0n, "用户2提取后锁仓未清空");

      // 5. 打印多用户日志
      console.log("\n多用户提取日志：");
      console.log("用户1提取金额:", ethers.formatEther(ETH_UNSTAKE));
      console.log("用户2提取金额:", ethers.formatEther(user2EthUnstake));
    });
  });

  describe("异常场景测试（边界+非法操作）", function () {
    it("无效池ID提取应失败（拦截非法池操作）", async function () {
      const invalidPoolId = 999; // 不存在的池ID
      const user = await getUserPoolData(ETH_POOL_ID, user1);
      await mineToUnlockBlock(user.unlockAt);

      await expect(
        metaNodeStake.connect(user1).withdraw(invalidPoolId)
      ).to.be.revertedWith("Invalid pool ID");
    });

    it("合约暂停时提取应失败（暂停机制生效）", async function () {
      // 1. 管理员暂停合约
      await metaNodeStake.connect(owner).pause();

      // 2. 挖矿到解锁区块
      const user = await getUserPoolData(ETH_POOL_ID, user1);
      await mineToUnlockBlock(user.unlockAt);

      // 3. 暂停状态下提取失败
      await expect(
        metaNodeStake.connect(user1).withdraw(ETH_POOL_ID)
      ).to.be.revertedWithCustomError(metaNodeStake, "EnforcedPause"); 

      // 4. 管理员解除暂停
      await metaNodeStake.connect(owner).unpause();

      // 5. 解除后可正常提取
      await expect(
        metaNodeStake.connect(user1).withdraw(ETH_POOL_ID)
      ).to.emit(metaNodeStake, "Withdrawn");
    });
  });
});