const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake v0.5.0 - stake test", function () {
  let MetaNodeStake, metaNodeStake;
  let ERC20Mock, erc20Token; // 新增：测试用ERC20代币
  let owner, alice, bob;
  const ETH_LOCK_BLOCKS = 10;   // ETH池锁仓期
  const ERC20_LOCK_BLOCKS = 20; // ERC20池锁仓期
  let ethPoolId = 0; // ETH池默认ID（构造函数初始化的第一个池）
  let erc20PoolId; // ERC20池ID（动态获取）
  let erc20Address; // ERC20代币地址

  // 部署合约+初始化测试环境
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // 1. 部署测试用ERC20代币
    ERC20Mock = await ethers.getContractFactory("MetaNodeToken");
    erc20Token = await ERC20Mock.deploy();
    await erc20Token.waitForDeployment();
    erc20Address = await erc20Token.getAddress();

    // 2. 部署质押合约（初始化ETH池）
    MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy(ETH_LOCK_BLOCKS);
    await metaNodeStake.waitForDeployment();

    // 3. 管理员添加ERC20质押池（获取其ID）
    await metaNodeStake.addPool(erc20Address, ERC20_LOCK_BLOCKS);
    erc20PoolId = Number(await metaNodeStake.getPoolCount()) - 1;
  });

  // ======== 辅助函数：简化测试代码 ========
  // 获取用户在指定池的质押数据
  async function getUserStake(poolId, user) {
    return metaNodeStake.users(poolId, user.address);
  }

  // 获取指定池的总质押量
  async function getPoolTotalStaked(poolId) {
    const pool = await metaNodeStake.pools(poolId);
    return pool.totalStaked;
  }

  // ======== 核心测试用例 ========
  describe("基础校验", function () {
    it("ETH池和ERC20池初始化正确", async function () {
      // 校验ETH池
      const ethPool = await metaNodeStake.pools(ethPoolId);
      expect(ethPool.token).to.equal(ethers.ZeroAddress); // ETH用0地址表示
      expect(ethPool.lockBlocks).to.equal(ETH_LOCK_BLOCKS);

      // 校验ERC20池
      const erc20Pool = await metaNodeStake.pools(erc20PoolId);
      expect(erc20Pool.token).to.equal(await erc20Token.getAddress());
      expect(erc20Pool.lockBlocks).to.equal(ERC20_LOCK_BLOCKS);
    });

    it("tokenToPoolId映射正确", async function () {
      expect(Number(await metaNodeStake.tokenToPoolId(ethers.ZeroAddress))).to.equal(ethPoolId + 1);
      expect(Number(await metaNodeStake.tokenToPoolId(erc20Address))).to.equal(erc20PoolId + 1);
    });
  });

  describe("ETH质押测试", function () {
    it("质押0金额应 revert", async function () {
      await expect(
        metaNodeStake.connect(alice).stake(ethPoolId, 0, { value: 0 }) // 新增poolId参数
      ).to.be.revertedWith("Amount must > 0");
    });

    it("正常质押ETH应更新状态并触发事件", async function () {
      const stakeAmount = ethers.parseEther("1.0");

      // 执行质押（需指定poolId）
      await expect(metaNodeStake.connect(alice).stake(ethPoolId, stakeAmount, { value: stakeAmount }))
        .to.emit(metaNodeStake, "Staked")
        .withArgs(alice.address, ethPoolId, stakeAmount); // 事件新增poolId

      // 校验用户状态
      const user = await getUserStake(ethPoolId, alice);
      expect(user.staked).to.equal(stakeAmount);

      // 校验池总质押量
      expect(await getPoolTotalStaked(ethPoolId)).to.equal(stakeAmount);

      // 校验合约ETH余额
      const contractBalance = await ethers.provider.getBalance(await metaNodeStake.getAddress());
      expect(contractBalance).to.equal(stakeAmount);
    });

    it("同一用户多次质押ETH应累加", async function () {
      const a = ethers.parseEther("0.5");
      const b = ethers.parseEther("0.8");

      await metaNodeStake.connect(alice).stake(ethPoolId, a, { value: a });
      await metaNodeStake.connect(alice).stake(ethPoolId, b, { value: b });

      const user = await getUserStake(ethPoolId, alice);
      const total = await getPoolTotalStaked(ethPoolId);

      expect(user.staked).to.equal(a + b);
      expect(total).to.equal(a + b);
    });

    it("多用户质押ETH应分别记录", async function () {
      const a = ethers.parseEther("1.2");
      const b = ethers.parseEther("2.3");

      await metaNodeStake.connect(alice).stake(ethPoolId, a, { value: a });
      await metaNodeStake.connect(bob).stake(ethPoolId, b, { value: b });

      expect((await getUserStake(ethPoolId, alice)).staked).to.equal(a);
      expect((await getUserStake(ethPoolId, bob)).staked).to.equal(b);
      expect(await getPoolTotalStaked(ethPoolId)).to.equal(a + b);
    });
  });

  describe("ERC20质押测试", function () {
    it("未授权代币应 revert", async function () {
      const stakeAmount = ethers.parseEther("100");
      // 未授权直接质押，应失败
      await expect(
        metaNodeStake.connect(alice).stake(erc20PoolId, stakeAmount)
      ).to.be.reverted; // ERC20转账失败（未授权）
    });

    it("正常质押ERC20应更新状态并触发事件", async function () {
      const stakeAmount = ethers.parseEther("100"); // 质押数量：100枚

      // 1、关键步骤：部署者（owner）向Alice转账ERC20代币
      await erc20Token.connect(owner).transfer(alice.address, stakeAmount);
      // 验证Alice的余额是否到账
      expect(await erc20Token.balanceOf(alice.address)).to.equal(stakeAmount);
      // 后续步骤：Alice授权合约使用代币并质押
      await erc20Token.connect(alice).approve(await metaNodeStake.getAddress(), stakeAmount);

      // 2. 执行质押（ERC20无需msg.value，只需指定poolId和amount）
      await expect(metaNodeStake.connect(alice).stake(erc20PoolId, stakeAmount))
        .to.emit(metaNodeStake, "Staked")
        .withArgs(alice.address, erc20PoolId, stakeAmount);

      // 3. 校验用户状态
      const user = await getUserStake(erc20PoolId, alice);
      expect(user.staked).to.equal(stakeAmount);

      // 4. 校验池总质押量
      expect(await getPoolTotalStaked(erc20PoolId)).to.equal(stakeAmount);

      // 5. 校验合约ERC20余额
      const contractBalance = await erc20Token.balanceOf(await metaNodeStake.getAddress());
      expect(contractBalance).to.equal(stakeAmount);
    });

    it("多池质押数据应隔离（ETH和ERC20互不干扰）", async function () {
      // 1. Alice质押ETH
      const ethAmount = ethers.parseEther("1.0");
      await metaNodeStake.connect(alice).stake(ethPoolId, ethAmount, { value: ethAmount });

      // 2. Alice质押ERC20
      const erc20Amount = ethers.parseEther("100");
      await erc20Token.connect(owner).transfer(alice.address, erc20Amount);
      expect(await erc20Token.balanceOf(alice.address)).to.equal(erc20Amount);
      await erc20Token.connect(alice).approve(await metaNodeStake.getAddress(), erc20Amount);
      await metaNodeStake.connect(alice).stake(erc20PoolId, erc20Amount);

      // 校验ETH池数据（ERC20质押不影响）
      expect((await getUserStake(ethPoolId, alice)).staked).to.equal(ethAmount);
      expect(await getPoolTotalStaked(ethPoolId)).to.equal(ethAmount);

      // 校验ERC20池数据（ETH质押不影响）
      expect((await getUserStake(erc20PoolId, alice)).staked).to.equal(erc20Amount);
      expect(await getPoolTotalStaked(erc20PoolId)).to.equal(erc20Amount);
    });
  });
});