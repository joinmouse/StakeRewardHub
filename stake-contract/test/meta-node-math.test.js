const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeMath", function () {
  let tester; // 测试合约实例
  let rewardToken; // 测试用ERC20代币
  let owner, user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // 部署测试合约
    const Tester = await ethers.getContractFactory("MetaNodeMathTester");
    tester = await Tester.deploy();
    await tester.waitForDeployment();

    // 部署一个测试ERC20代币
    const ERC20 = await ethers.getContractFactory("MetaNodeToken");
    rewardToken = await ERC20.deploy();
    await rewardToken.waitForDeployment();
  });

  // 测试 safeETHTransfer
  it("should transfer ETH successfully", async function () {
    const amount = ethers.parseEther("1.0");
    const userBalBefore = await ethers.provider.getBalance(user.address);

    // 调用测试合约的包装函数，中转调用库的 safeETHTransfer
    await tester.testSafeETHTransfer(user.address, amount, { value: amount });

    const userBalAfter = await ethers.provider.getBalance(user.address);
    expect(userBalAfter - userBalBefore).to.equal(amount);
  });

  // 测试 getMultiplier
  it("should calculate multiplier correctly", async function () {
    const from = 100;
    const to = 200;
    const perBlock = 5;
    // 预期: (200-100) * 5 = 500
    const result = await tester.testGetMultiplier(from, to, perBlock);
    expect(result).to.equal(500);
  });
});