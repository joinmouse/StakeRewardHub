const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeStake 解除质押测试", function () {
  let metaNodeStake; // 合约实例
  let owner; // 部署者
  let user1; // 测试用户
  let user2; // 其他用户

  // 部署合约并初始化测试环境
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // 部署阶段2合约（支持质押+解除质押）
    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    metaNodeStake = await MetaNodeStake.deploy();
    await metaNodeStake.waitForDeployment();
  });

  // 测试1：用户质押后可正常解除质押
  it("应允许用户解除质押并收到ETH", async function () {
    // 1. 用户1质押 2 ETH
    const stakeAmount = ethers.parseEther("2.0");
    await metaNodeStake.connect(user1).stake({ value: stakeAmount });

    // 检查质押后状态
    expect(await metaNodeStake.userStake(user1.address)).to.equal(stakeAmount);
    expect(await metaNodeStake.totalStaked()).to.equal(stakeAmount);

    // 2. 用户1解除质押 1 ETH
    const unstakeAmount = ethers.parseEther("1.0");
    const user1BalanceBefore = await ethers.provider.getBalance(user1.address);
    const tx = await metaNodeStake.connect(user1).unstake(unstakeAmount);
    const receipt = await tx.wait();
    const gasPrice = receipt.effectiveGasPrice ?? tx.gasPrice; // 优先用 effectiveGasPrice，否则用 tx.gasPrice
    const gasCost = receipt.gasUsed * gasPrice; // 类型：BigInt
    const user1BalanceAfter = await ethers.provider.getBalance(user1.address);

    // 检查状态更新：质押量减少，总质押量减少
    expect(await metaNodeStake.userStake(user1.address)).to.equal(stakeAmount - (unstakeAmount));
    expect(await metaNodeStake.totalStaked()).to.equal(stakeAmount - unstakeAmount);

    // 检查ETH到账（扣除gas后余额应增加）
    expect(user1BalanceAfter).to.be.closeTo(
      user1BalanceBefore - gasCost + unstakeAmount,
      ethers.parseEther("0.001") // 允许微小误差（gas波动）
    );

    // 检查事件是否正确触发
    await expect(tx)
      .to.emit(metaNodeStake, "Unstaked")
      .withArgs(user1.address, unstakeAmount);
  });

  // 测试2：解除质押金额不能超过质押量
  it("应拒绝解除超过质押量的解除质押请求", async function () {
    // 用户1质押 1 ETH
    await metaNodeStake.connect(user1).stake({ value: ethers.parseEther("1.0") });

    // 尝试解除质押 2 ETH（超过质押量）
    await expect(
      metaNodeStake.connect(user1).unstake(ethers.parseEther("2.0"))
    ).to.be.revertedWith("Insufficient staked amount");
  });

  // 测试3：未质押的用户不能解除质押
  it("应拒绝未质押用户的解除质押请求", async function () {
    // 用户1未质押，直接解除质押
    await expect(
      metaNodeStake.connect(user1).unstake(ethers.parseEther("1.0"))
    ).to.be.revertedWith("Insufficient staked amount");
  });

  // 测试4：解除质押金额不能为0
  it("应拒绝解除质押金额为0的请求", async function () {
    // 用户1质押 1 ETH
    await metaNodeStake.connect(user1).stake({ value: ethers.parseEther("1.0") });

    // 尝试解除质押 0 ETH
    await expect(
      metaNodeStake.connect(user1).unstake(0)
    ).to.be.revertedWith("Unstake amount must be greater than zero");
  });

  // 测试5：多用户解除质押不相互影响
  it("多用户解除质押应独立计算", async function () {
    // 用户1质押 3 ETH，用户2质押 5 ETH
    await metaNodeStake.connect(user1).stake({ value: ethers.parseEther("3.0") });
    await metaNodeStake.connect(user2).stake({ value: ethers.parseEther("5.0") });

    // 用户1解除质押 1 ETH，用户2解除质押 2 ETH
    await metaNodeStake.connect(user1).unstake(ethers.parseEther("1.0"));
    await metaNodeStake.connect(user2).unstake(ethers.parseEther("2.0"));

    // 检查各自的剩余质押量
    expect(await metaNodeStake.userStake(user1.address)).to.equal(ethers.parseEther("2.0"));
    expect(await metaNodeStake.userStake(user2.address)).to.equal(ethers.parseEther("3.0"));
    expect(await metaNodeStake.totalStaked()).to.equal(ethers.parseEther("5.0")); // 2+3=5
  });
});