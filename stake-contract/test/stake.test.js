// test/MetaNodeStake.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake - stake test", function () {
  let MetaNodeStake, metaNodeStake;
  let owner, alice, bob;
  const LOCK_BLOCKS = 10; // 锁仓10个区块（测试用）

  // Deploy a fresh contract before each test
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy(LOCK_BLOCKS);
    await metaNodeStake.waitForDeployment();
  });

  // 边界条件测试, 地址0质押
  it("should revert when staking zero value", async function () {
    await expect(
      metaNodeStake.connect(alice).stake({ value: 0 })
    ).to.be.revertedWith("Stake amount must be greater than zero");
  });

  // 正常质押测试
  it("should accept stake, emit event and update state", async function () {
    const stakeAmount = ethers.parseEther("1.0");

    await expect(metaNodeStake.connect(alice).stake({ value: stakeAmount }))
      .to.emit(metaNodeStake, "Staked")
      .withArgs(alice.address, stakeAmount);

    const userStake = await metaNodeStake.users(alice.address);
    const total = await metaNodeStake.totalStaked();
    // 获取合约余额以验证资金是否正确存入
    const contractBalance = await ethers.provider.getBalance(metaNodeStake.getAddress());

    expect(userStake.staked).to.equal(stakeAmount);
    expect(total).to.equal(stakeAmount);
    expect(contractBalance).to.equal(stakeAmount);
  });

  // 同一用户的质押应累加
  it("should accumulate stakes from the same user", async function () {
    const a = ethers.parseEther("0.5");
    const b = ethers.parseEther("0.8");

    await metaNodeStake.connect(alice).stake({ value: a });
    await metaNodeStake.connect(alice).stake({ value: b });

    const user = await metaNodeStake.users(alice.address);
    const total = await metaNodeStake.totalStaked();

    expect(user.staked).to.equal(a + b);
    expect(total).to.equal(a + b);
  });

  // 多个用户的质押应被记录
  it("should track stakes from multiple users", async function () {
    const a = ethers.parseEther("1.2");
    const b = ethers.parseEther("2.3");

    await metaNodeStake.connect(alice).stake({ value: a });
    await metaNodeStake.connect(bob).stake({ value: b });

    const aliceStake = await metaNodeStake.users(alice.address);
    const bobStake = await metaNodeStake.users(bob.address);
    const total = await metaNodeStake.totalStaked();

    expect(aliceStake.staked).to.equal(a);
    expect(bobStake.staked).to.equal(b);
    expect(total).to.equal(a + b);
  });
});