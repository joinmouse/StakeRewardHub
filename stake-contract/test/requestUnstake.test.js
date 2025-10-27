// const { expect } = require("chai");
// const { ethers } = require("hardhat");

// describe("MetaNodeStake - requestUnstake test", function () {
//   let simpleStake;
//   let owner, user1;
//   const LOCK_BLOCKS = 10; // 锁仓10个区块（测试用）

//   beforeEach(async function () {
//     [owner, user1] = await ethers.getSigners();
//     // 部署合约，设置锁仓10个区块
//     const SimpleStake = await ethers.getContractFactory("MetaNodeStake");
//     simpleStake = await SimpleStake.deploy(LOCK_BLOCKS);
//     await simpleStake.waitForDeployment();
    
//     // 提前让用户质押10 ETH，为赎回做准备
//     await simpleStake.connect(user1).stake({ value: ethers.parseEther("10.0") });
//     const user = await simpleStake.users(user1.address);
//   });

//   it("should correctly convert staked amount to locked amount and record unlock time", async function () {
//     // 1. 用户申请赎回5 ETH
//     const unstakeAmount = ethers.parseEther("5.0");
//     const tx = await simpleStake.connect(user1).requestUnstake(unstakeAmount);
//     // 2. 获取当前区块号（作为赎回申请的起始区块）
//     const currentBlock = await ethers.provider.getBlockNumber();
//     // 3. 检查用户状态变化
//     const user = await simpleStake.users(user1.address);
//     // 质押量应减少5 ETH（10 - 5 = 5）
//     expect(user.staked).to.equal(ethers.parseEther("5.0"));
//     // 锁仓量应增加5 ETH
//     expect(user.locked).to.equal(unstakeAmount);
//     // 解锁时间应为：当前区块 + 锁仓区块数（10）
//     expect(user.unlockAt).to.equal(currentBlock + LOCK_BLOCKS);

//     // 4. 检查全局总质押量（减少5 ETH）
//     expect(await simpleStake.totalStaked()).to.equal(ethers.parseEther("5.0"));

//     // 5. 检查事件是否正确触发（包含解锁时间）
//     await expect(tx)
//       .to.emit(simpleStake, "RequestUnstaked")
//       .withArgs(user1.address, unstakeAmount, currentBlock + LOCK_BLOCKS);
//   });

//   it("should reject requests to unstake more than staked amount", async function () {
//     // 用户质押了10 ETH，尝试赎回15 ETH（超额）
//     await expect(
//       simpleStake.connect(user1).requestUnstake(ethers.parseEther("15.0"))
//     ).to.be.revertedWith("Unstake: not enough");
//   });

//   it("should reject requests to unstake zero amount", async function () {
//     await expect(
//       simpleStake.connect(user1).requestUnstake(0)
//     ).to.be.revertedWith("Unstake: amount must be > 0");
//   });
// });