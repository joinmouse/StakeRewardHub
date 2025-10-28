const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake v0.5.0 - requestUnstake test", function () {
  let metaNodeStake;
  let erc20Token; // ERC20测试代币
  let owner, user1;
  const ETH_LOCK_BLOCKS = 10; // ETH池锁仓期
  const ERC20_LOCK_BLOCKS = 20; // ERC20池锁仓期
  let ethPoolId = 0; // 默认ETH池ID
  let erc20PoolId; // ERC20池ID

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    // 1. 部署ERC20测试代币并给user1转账
    const ERC20Mock = await ethers.getContractFactory("MetaNodeToken");
    erc20Token = await ERC20Mock.deploy();
    await erc20Token.waitForDeployment();
    const erc20Address = await erc20Token.getAddress();
    await erc20Token.connect(owner).transfer(user1.address, ethers.parseEther("100")); // 转100枚ERC20给user1

    // 2. 部署质押合约（初始化ETH池）
    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy(ETH_LOCK_BLOCKS);
    await metaNodeStake.waitForDeployment();

    // 3. 添加ERC20质押池并获取ID
    await metaNodeStake.addPool(erc20Address, ERC20_LOCK_BLOCKS);
    const poolCount = await metaNodeStake.getPoolCount();
    erc20PoolId = Number(poolCount) - 1;

    // 4. user1质押ETH和ERC20（为赎回做准备）
    // 质押10 ETH到ETH池
    await metaNodeStake.connect(user1).stake(ethPoolId, ethers.parseEther("10.0"), { value: ethers.parseEther("10.0") });
    // 授权并质押50 ERC20到ERC20池
    await erc20Token.connect(user1).approve(await metaNodeStake.getAddress(), ethers.parseEther("50"));
    await metaNodeStake.connect(user1).stake(erc20PoolId, ethers.parseEther("50"));
  });

  describe("ETH池赎回申请", function () {
    it("应正确转换质押量为锁仓量并记录解锁时间", async function () {
      const unstakeAmount = ethers.parseEther("5.0");
      const tx = await metaNodeStake.connect(user1).requestUnstake(ethPoolId, unstakeAmount);

      // 获取当前区块号
      const currentBlock = await ethers.provider.getBlockNumber();
      // 查询用户在ETH池的状态
      const user = await metaNodeStake.users(ethPoolId, user1.address);
      // 查询ETH池总质押量
      const ethPool = await metaNodeStake.pools(ethPoolId);

      // 校验用户状态：质押量减少，锁仓量增加
      expect(user.staked).to.equal(ethers.parseEther("5.0")); // 10 - 5 = 5
      expect(user.locked).to.equal(unstakeAmount);
      // 校验解锁时间：当前区块 + ETH池锁仓期
      expect(user.unlockAt).to.equal(BigInt(currentBlock + ETH_LOCK_BLOCKS));
      // 校验池总质押量减少
      expect(ethPool.totalStaked).to.equal(ethers.parseEther("5.0"));

      // 校验事件（新增poolId参数）
      await expect(tx)
        .to.emit(metaNodeStake, "RequestUnstaked")
        .withArgs(user1.address, ethPoolId, unstakeAmount, currentBlock + ETH_LOCK_BLOCKS);
    });

    it("应拒绝赎回量超过质押量的请求", async function () {
      // 质押了10 ETH，尝试赎回15 ETH
      await expect(
        metaNodeStake.connect(user1).requestUnstake(ethPoolId, ethers.parseEther("15.0"))
      ).to.be.revertedWith("Unstake: not enough");
    });

    it("应拒绝赎回0金额的请求", async function () {
      await expect(
        metaNodeStake.connect(user1).requestUnstake(ethPoolId, 0)
      ).to.be.revertedWith("Unstake: amount must be > 0");
    });
  });

  describe("ERC20池赎回申请", function () {
    it("应正确转换质押量为锁仓量并记录解锁时间", async function () {
      const unstakeAmount = ethers.parseEther("20.0");
      const tx = await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, unstakeAmount);

      const currentBlock = await ethers.provider.getBlockNumber();
      const user = await metaNodeStake.users(erc20PoolId, user1.address);
      const erc20Pool = await metaNodeStake.pools(erc20PoolId);

      // 校验用户状态：50 - 20 = 30
      expect(user.staked).to.equal(ethers.parseEther("30.0"));
      expect(user.locked).to.equal(unstakeAmount);
      // 解锁时间：当前区块 + ERC20池锁仓期
      expect(user.unlockAt).to.equal(BigInt(currentBlock + ERC20_LOCK_BLOCKS));
      // 校验池总质押量减少
      expect(erc20Pool.totalStaked).to.equal(ethers.parseEther("30.0"));

      // 校验事件
      await expect(tx)
        .to.emit(metaNodeStake, "RequestUnstaked")
        .withArgs(user1.address, erc20PoolId, unstakeAmount, currentBlock + ERC20_LOCK_BLOCKS);
    });

    it("多池赎回数据应隔离（ETH与ERC20互不影响）", async function () {
      // 从ETH池赎回5 ETH
      await metaNodeStake.connect(user1).requestUnstake(ethPoolId, ethers.parseEther("5.0"));
      // 从ERC20池赎回20 ERC20
      await metaNodeStake.connect(user1).requestUnstake(erc20PoolId, ethers.parseEther("20.0"));

      // 校验ETH池用户状态（不受ERC20赎回影响）
      const ethUser = await metaNodeStake.users(ethPoolId, user1.address);
      expect(ethUser.staked).to.equal(ethers.parseEther("5.0"));
      expect(ethUser.locked).to.equal(ethers.parseEther("5.0"));

      // 校验ERC20池用户状态（不受ETH赎回影响）
      const erc20User = await metaNodeStake.users(erc20PoolId, user1.address);
      expect(erc20User.staked).to.equal(ethers.parseEther("30.0"));
      expect(erc20User.locked).to.equal(ethers.parseEther("20.0"));
    });
  });
});