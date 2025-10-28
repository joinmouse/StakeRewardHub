const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake - 赎回申请（requestUnstake）功能测试", function () {
  // 合约与代币实例
  let metaNodeStake;
  let metaNodeToken;

  // 角色地址
  let owner;
  let user1;

  // 配置常量（全大写区分配置）
  const ETH_LOCK_BLOCKS = 10;
  const ERC20_LOCK_BLOCKS = 20;
  const ETH_POOL_ID = 0; // 固定ETH池ID
  const USER1_ETH_STAKE = ethers.parseEther("10.0"); // 用户1 ETH质押量
  const USER1_ERC20_STAKE = ethers.parseEther("50.0"); // 用户1 ERC20质押量
  const USER1_ERC20_INIT_BALANCE = ethers.parseEther("100.0"); // 用户1初始ERC20余额

  // 动态变量
  let erc20PoolId;
  let metaNodeTokenAddress;

  // ======== 部署与初始化（优化状态隔离） ========
  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // 1. 部署MetaNodeToken（统一质押/奖励代币）
    const MetaNodeToken = await ethers.getContractFactory("MetaNodeToken");
    metaNodeToken = await MetaNodeToken.deploy();
    await metaNodeToken.waitForDeployment();
    metaNodeTokenAddress = await metaNodeToken.getAddress();

    // 2. 给用户1转账ERC20代币
    await metaNodeToken.connect(owner).transfer(user1.address, USER1_ERC20_INIT_BALANCE);
    expect(await metaNodeToken.balanceOf(user1.address)).to.equal(
      USER1_ERC20_INIT_BALANCE,
      "用户1初始ERC20余额错误"
    );

    // 3. 部署质押合约（适配奖励机制参数）
    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy(
      ETH_LOCK_BLOCKS,
      metaNodeTokenAddress, // ETH池奖励代币
      100 // ETH池奖励率（示例值）
    );
    await metaNodeStake.waitForDeployment();

    // 4. 添加ERC20质押池（适配奖励机制参数）
    await metaNodeStake.addPool(
      metaNodeTokenAddress, // 质押代币
      ERC20_LOCK_BLOCKS,
      metaNodeTokenAddress, // 奖励代币
      200 // ERC20池奖励率（示例值）
    );
    erc20PoolId = Number(await metaNodeStake.getPoolCount()) - 1;

    // 5. 初始化奖励池（避免奖励相关报错）
    const rewardAmount = ethers.parseEther("10000");
    await metaNodeToken.transfer(await metaNodeStake.getAddress(), rewardAmount);
    await metaNodeStake.setRewardEnabled(true);

    // 6. 用户1质押ETH（为赎回做准备）
    await metaNodeStake.connect(user1).stake(ETH_POOL_ID, USER1_ETH_STAKE, {
      value: USER1_ETH_STAKE,
    });
    expect((await metaNodeStake.users(ETH_POOL_ID, user1.address)).staked).to.equal(
      USER1_ETH_STAKE,
      "ETH质押失败"
    );

    // 7. 用户1授权并质押ERC20（为赎回做准备）
    await metaNodeToken.connect(user1).approve(
      await metaNodeStake.getAddress(),
      USER1_ERC20_STAKE
    );
    await metaNodeStake.connect(user1).stake(erc20PoolId, USER1_ERC20_STAKE);
    expect((await metaNodeStake.users(erc20PoolId, user1.address)).staked).to.equal(
      USER1_ERC20_STAKE,
      "ERC20质押失败"
    );
  });

  // ======== 辅助函数（简化重复逻辑） ========
  /**
   * 获取用户在指定池的完整数据
   * @param {number} poolId - 池ID
   * @param {Signer} user - 用户签名者
   * @returns {Promise<Object>} 用户数据
   */
  const getUserPoolData = async (poolId, user) => {
    return metaNodeStake.users(poolId, await user.getAddress());
  };

  /**
   * 获取指定池的完整数据
   * @param {number} poolId - 池ID
   * @returns {Promise<Object>} 池数据
   */
  const getPoolData = async (poolId) => {
    return metaNodeStake.pools(poolId);
  };

  // ======== 核心测试用例 ========
  describe("ETH池赎回申请", function () {
    it("正常赎回：应转换质押量为锁仓量，记录解锁时间", async function () {
      const unstakeAmount = ethers.parseEther("5.0");

      // 执行赎回申请
      const tx = await metaNodeStake.connect(user1).requestUnstake(ETH_POOL_ID, unstakeAmount);

      // 获取用户和池数据
      const userData = await getUserPoolData(ETH_POOL_ID, user1);
      const poolData = await getPoolData(ETH_POOL_ID);

      // 1. 校验用户状态
      const currentBlock = await ethers.provider.getBlockNumber();
      const expectedUnlockAt = BigInt(currentBlock + ETH_LOCK_BLOCKS);
      expect(userData.staked).to.equal(USER1_ETH_STAKE - unstakeAmount, "用户质押量未减少");
      expect(userData.locked).to.equal(unstakeAmount, "用户锁仓量未增加");
      expect(userData.unlockAt).to.equal(expectedUnlockAt, "解锁时间计算错误");

      // 2. 校验池总质押量
      expect(poolData.totalStaked).to.equal(USER1_ETH_STAKE - unstakeAmount, "池总质押量未减少");

      // 3. 校验事件（包含poolId参数）
      await expect(tx)
        .to.emit(metaNodeStake, "RequestUnstaked")
        .withArgs(
          await user1.getAddress(),
          ETH_POOL_ID,
          unstakeAmount,
          Number(expectedUnlockAt)
        );

      // 4. 打印日志（方便调试）
      console.log("ETH池赎回申请日志：");
      console.log("赎回金额:", ethers.formatEther(unstakeAmount));
      console.log("剩余质押量:", ethers.formatEther(userData.staked));
      console.log("锁仓量:", ethers.formatEther(userData.locked));
      console.log("预计解锁区块:", Number(expectedUnlockAt));
    });

    it("异常赎回：赎回量超过质押量应拒绝", async function () {
      const overUnstakeAmount = ethers.parseEther("15.0"); // 超过质押的10 ETH

      await expect(
        metaNodeStake.connect(user1).requestUnstake(ETH_POOL_ID, overUnstakeAmount)
      ).to.be.revertedWith("Unstake: not enough");
    });

    it("异常赎回：赎回0金额应拒绝", async function () {
      await expect(
        metaNodeStake.connect(user1).requestUnstake(ETH_POOL_ID, 0)
      ).to.be.revertedWith("Unstake: amount must be > 0");
    });

    it("异常赎回：无效池ID应拒绝", async function () {
      const invalidPoolId = 999; // 不存在的池ID
      const unstakeAmount = ethers.parseEther("5.0");

      await expect(
        metaNodeStake.connect(user1).requestUnstake(invalidPoolId, unstakeAmount)
      ).to.be.revertedWith("Invalid pool ID");
    });
  });

  describe("ERC20池赎回申请", function () {
    it("正常赎回：应转换质押量为锁仓量，记录解锁时间", async function () {
      const unstakeAmount = ethers.parseEther("20.0");

      // 执行赎回申请
      const tx = await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, unstakeAmount);

      // 获取用户和池数据
      const userData = await getUserPoolData(erc20PoolId, user1);
      const poolData = await getPoolData(erc20PoolId);

      // 1. 校验用户状态
      const currentBlock = await ethers.provider.getBlockNumber();
      const expectedUnlockAt = BigInt(currentBlock + ERC20_LOCK_BLOCKS);
      expect(userData.staked).to.equal(USER1_ERC20_STAKE - unstakeAmount, "用户质押量未减少");
      expect(userData.locked).to.equal(unstakeAmount, "用户锁仓量未增加");
      expect(userData.unlockAt).to.equal(expectedUnlockAt, "解锁时间计算错误");

      // 2. 校验池总质押量
      expect(poolData.totalStaked).to.equal(USER1_ERC20_STAKE - unstakeAmount, "池总质押量未减少");

      // 3. 校验事件
      await expect(tx)
        .to.emit(metaNodeStake, "RequestUnstaked")
        .withArgs(
          await user1.getAddress(),
          erc20PoolId,
          unstakeAmount,
          Number(expectedUnlockAt)
        );

      // 4. 打印日志
      console.log("\nERC20池赎回申请日志：");
      console.log("赎回金额:", ethers.formatEther(unstakeAmount));
      console.log("剩余质押量:", ethers.formatEther(userData.staked));
      console.log("锁仓量:", ethers.formatEther(userData.locked));
      console.log("预计解锁区块:", Number(expectedUnlockAt));
    });

    it("边界赎回：赎回全部质押量应成功", async function () {
      const fullUnstakeAmount = USER1_ERC20_STAKE; // 赎回全部50 ERC20
      await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, fullUnstakeAmount);

      const userData = await getUserPoolData(erc20PoolId, user1);
      expect(userData.staked).to.equal(0, "全部赎回后质押量应为0");
      expect(userData.locked).to.equal(fullUnstakeAmount, "全部赎回后锁仓量应等于原质押量");
    });

    it("数据隔离：多池赎回互不影响", async function () {
      // ETH池赎回5 ETH
      const ethUnstakeAmount = ethers.parseEther("5.0");
      await metaNodeStake.connect(user1).requestUnstake(ETH_POOL_ID, ethUnstakeAmount);

      // ERC20池赎回20 ERC20
      const erc20UnstakeAmount = ethers.parseEther("20.0");
      await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, erc20UnstakeAmount);

      // 校验ETH池用户状态（不受ERC20赎回影响）
      const ethUserData = await getUserPoolData(ETH_POOL_ID, user1);
      expect(ethUserData.staked).to.equal(USER1_ETH_STAKE - ethUnstakeAmount, "ETH池数据受干扰");
      expect(ethUserData.locked).to.equal(ethUnstakeAmount, "ETH池锁仓数据受干扰");

      // 校验ERC20池用户状态（不受ETH赎回影响）
      const erc20UserData = await getUserPoolData(erc20PoolId, user1);
      expect(erc20UserData.staked).to.equal(USER1_ERC20_STAKE - erc20UnstakeAmount, "ERC20池数据受干扰");
      expect(erc20UserData.locked).to.equal(erc20UnstakeAmount, "ERC20池锁仓数据受干扰");

      console.log("\n多池赎回隔离日志：");
      console.log("ETH池剩余质押:", ethers.formatEther(ethUserData.staked));
      console.log("ERC20池剩余质押:", ethers.formatEther(erc20UserData.staked));
    });
  });

  describe("赎回申请与奖励机制兼容性", function () {
    it("赎回申请应触发奖励更新（累计未领取奖励）", async function () {
      // 质押后挖矿5个区块（累计奖励）
      await ethers.provider.send("evm_mine", []); // 挖矿1个区块（避免区块号重复）
      const initialUser = await getUserPoolData(ETH_POOL_ID, user1);
      const initialRewardBlock = initialUser.lastRewardBlock;

      // 执行赎回申请（触发_updateRewards）
      const unstakeAmount = ethers.parseEther("3.0");
      await metaNodeStake.connect(user1).requestUnstake(ETH_POOL_ID, unstakeAmount);

      // 校验奖励计算基准区块已更新
      const updatedUser = await getUserPoolData(ETH_POOL_ID, user1);
      expect(updatedUser.lastRewardBlock).to.be.gt(initialRewardBlock, "奖励基准区块未更新");
      console.log("\n奖励机制兼容性日志：");
      console.log("赎回前奖励基准区块:", Number(initialRewardBlock));
      console.log("赎回后奖励基准区块:", Number(updatedUser.lastRewardBlock));
    });
  });
});