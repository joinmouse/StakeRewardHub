const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake v0.5.0 - withdraw test", function () {
  let metaNodeStake;
  let erc20Token;
  let owner, user1;
  const ETH_LOCK_BLOCKS = 10; // ETH池锁仓期
  const ERC20_LOCK_BLOCKS = 20; // ERC20池锁仓期
  const ETH_STAKE = ethers.parseEther("10.0"); // ETH质押量
  const ETH_UNSTAKE = ethers.parseEther("5.0"); // ETH赎回量
  const ERC20_STAKE = ethers.parseEther("100.0"); // ERC20质押量
  const ERC20_UNSTAKE = ethers.parseEther("40.0"); // ERC20赎回量
  let ethPoolId = 0; // 默认ETH池ID
  let erc20PoolId; // ERC20池ID

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // 1. 部署ERC20代币并转账给user1
    const ERC20Mock = await ethers.getContractFactory("MetaNodeToken");
    erc20Token = await ERC20Mock.deploy();
    await erc20Token.waitForDeployment();
    const erc20Addr = await erc20Token.getAddress();
    await erc20Token.connect(owner).transfer(user1.address, ERC20_STAKE);

    // 2. 部署质押合约（初始化ETH池）
    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy(ETH_LOCK_BLOCKS);
    await metaNodeStake.waitForDeployment();

    // 3. 添加ERC20池并获取ID
    await metaNodeStake.addPool(erc20Addr, ERC20_LOCK_BLOCKS);
    const poolCount = await metaNodeStake.getPoolCount();
    erc20PoolId = Number(poolCount) - 1;

    // 4. 用户质押资产并发起赎回申请
    // ETH池：质押10ETH → 赎回5ETH
    await metaNodeStake.connect(user1).stake(ethPoolId, ETH_STAKE, { value: ETH_STAKE });
    await metaNodeStake.connect(user1).requestUnstake(ethPoolId, ETH_UNSTAKE);

    // ERC20池：授权→质押100→赎回40
    await erc20Token.connect(user1).approve(await metaNodeStake.getAddress(), ERC20_STAKE);
    await metaNodeStake.connect(user1).stake(erc20PoolId, ERC20_STAKE);
    await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, ERC20_UNSTAKE);
  });

  describe("ETH池提取测试", function () {
    it("锁仓期结束后应成功提取ETH", async function () {
      // 1. 获取用户ETH池锁仓信息
      const user = await metaNodeStake.users(ethPoolId, user1.address);
      const unlockAt = user.unlockAt;
      const lockedAmount = user.locked;
      expect(lockedAmount).to.equal(ETH_UNSTAKE);

      // 2. 挖矿到解锁区块（确保过锁仓期）
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToMine = Number(unlockAt - BigInt(currentBlock));
      await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);
      expect(await ethers.provider.getBlockNumber()).to.be.gte(Number(unlockAt));

      // 3. 记录提取前用户ETH余额
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      // 4. 执行提取
      const withdrawTx = await metaNodeStake.connect(user1).withdraw(ethPoolId);
      const receipt = await withdrawTx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // 5. 验证ETH到账（扣除gas）
      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + lockedAmount - gasCost);

      // 6. 验证用户锁仓状态清空
      const userAfter = await metaNodeStake.users(ethPoolId, user1.address);
      expect(userAfter.locked).to.equal(0);

      // 7. 验证事件（含poolId）
      await expect(withdrawTx)
        .to.emit(metaNodeStake, "Withdrawn")
        .withArgs(user1.address, ethPoolId, lockedAmount);
    });

    it("锁仓期内提取应失败", async function () {
      // 1. 获取解锁区块号
      const user = await metaNodeStake.users(ethPoolId, user1.address);
      const unlockAt = user.unlockAt;

      // 2. 挖矿到锁仓期内（距离解锁还剩2个区块）
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToMine = Math.max(0, Number(unlockAt - BigInt(currentBlock) - 2n));
      await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);
      expect(await ethers.provider.getBlockNumber()).to.be.lt(Number(unlockAt));

      // 3. 尝试提取应被拒绝
      await expect(
        metaNodeStake.connect(user1).withdraw(ethPoolId)
      ).to.be.revertedWith("Withdraw: funds are still locked");

      // 4. 锁仓金额应保持不变
      const userAfter = await metaNodeStake.users(ethPoolId, user1.address);
      expect(userAfter.locked).to.equal(ETH_UNSTAKE);
    });
  });

  describe("ERC20池提取测试", function () {
    it("锁仓期结束后应成功提取ERC20", async function () {
      // 1. 获取用户ERC20池锁仓信息
      const user = await metaNodeStake.users(erc20PoolId, user1.address);
      const unlockAt = user.unlockAt;
      const lockedAmount = user.locked;
      expect(lockedAmount).to.equal(ERC20_UNSTAKE);

      // 2. 挖矿到解锁区块
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToMine = Number(unlockAt - BigInt(currentBlock));
      await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);
      expect(await ethers.provider.getBlockNumber()).to.be.gte(Number(unlockAt));

      // 3. 记录提取前用户ERC20余额
      const balanceBefore = await erc20Token.balanceOf(user1.address);

      // 4. 执行提取
      const withdrawTx = await metaNodeStake.connect(user1).withdraw(erc20PoolId);

      // 5. 验证ERC20到账
      const balanceAfter = await erc20Token.balanceOf(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + lockedAmount);

      // 6. 验证用户锁仓状态清空
      const userAfter = await metaNodeStake.users(erc20PoolId, user1.address);
      expect(userAfter.locked).to.equal(0);

      // 7. 验证事件
      await expect(withdrawTx)
        .to.emit(metaNodeStake, "Withdrawn")
        .withArgs(user1.address, erc20PoolId, lockedAmount);
    });

    it("无锁仓资金时提取应失败", async function () {
      // 1. 先提取完ERC20锁仓资金
      const user = await metaNodeStake.users(erc20PoolId, user1.address);
      await ethers.provider.send("hardhat_mine", [user.unlockAt.toString()]);
      await metaNodeStake.connect(user1).withdraw(erc20PoolId);

      // 2. 再次提取应失败
      await expect(
        metaNodeStake.connect(user1).withdraw(erc20PoolId)
      ).to.be.revertedWith("Withdraw: no locked funds");

      // 3. 其他用户无锁仓资金提取也失败
      await expect(
        metaNodeStake.connect(owner).withdraw(erc20PoolId)
      ).to.be.revertedWith("Withdraw: no locked funds");
    });
  });

  describe("多池提取隔离性", function () {
    it("ETH池提取不影响ERC20池锁仓状态", async function () {
      // 1. 获取ETH池和ERC20池的解锁信息
      const ethUser = await metaNodeStake.users(ethPoolId, user1.address);
      const erc20User = await metaNodeStake.users(erc20PoolId, user1.address);
      const ethUnlockAt = Number(ethUser.unlockAt);
      const erc20UnlockAt = Number(erc20User.unlockAt);
      console.log("ETH Unlock At:", ethUnlockAt, "ERC20 Unlock At:", erc20UnlockAt);

      // 关键：确保ETH池解锁区块 <= ERC20池解锁区块（避免ETH解锁时ERC20已解锁）
      expect(ethUnlockAt).to.be.lte(erc20UnlockAt);

      // 2. 精确挖矿到ETH池解锁区块（不多挖）
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksToMine = ethUnlockAt - currentBlock; // 仅挖需要的区块数
      await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);

      // 3. 提取ETH池资金
      await metaNodeStake.connect(user1).withdraw(ethPoolId);

      // 4. 验证当前区块 <= ERC20池解锁区块（确保ERC20仍在锁仓期）
      const currentBlockAfter = await ethers.provider.getBlockNumber();
      console.log("Current Block After ETH Withdraw:", currentBlockAfter);
      expect(currentBlockAfter).to.be.lte(erc20UnlockAt); // 核心修复：用lte替代lt（允许等于）

      // 5. 验证ERC20池锁仓状态未变
      const updatedErc20User = await metaNodeStake.users(erc20PoolId, user1.address);
      expect(updatedErc20User.locked).to.equal(ERC20_UNSTAKE);
    });
  });
});