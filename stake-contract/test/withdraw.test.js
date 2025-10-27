// const { expect } = require("chai");
// const { ethers } = require("hardhat");

// describe("MetaNodeStake - withdraw test", function () {
//   let stakeContract;
//   let owner, user1;
//   const LOCK_BLOCKS = 10; // 锁仓10个区块（测试用）
//   const STAKE_AMOUNT = ethers.parseEther("10.0");  // 质押10 ETH
//   const UNSTAKE_AMOUNT = ethers.parseEther("5.0"); // 发起赎回5 ETH

//   beforeEach(async function () {
//     // 1. 获取签名者
//     [owner, user1] = await ethers.getSigners();

//     // 2. 部署合约（单参数：锁仓区块数）
//     const StakeFactory = await ethers.getContractFactory("MetaNodeStake");
//     stakeContract = await StakeFactory.deploy(LOCK_BLOCKS);
//     await stakeContract.waitForDeployment();

//     // 3. 用户质押ETH（为后续赎回做准备）
//     await stakeContract.connect(user1).stake({ value: STAKE_AMOUNT });

//     // 4. 用户发起赎回申请（进入锁仓状态）
//     await stakeContract.connect(user1).requestUnstake(UNSTAKE_AMOUNT);
//   });

//   it("lock period ended", async function () {
//     // 1. 获取用户当前锁仓信息
//     const userBefore = await stakeContract.users(user1.address);
//     const unlockAt = userBefore.unlockAt; // 解锁区块号
//     const lockedAmount = userBefore.locked; // 锁仓金额（应等于UNSTAKE_AMOUNT）

//     // 2. 验证初始状态：锁仓金额正确
//     expect(lockedAmount).to.equal(UNSTAKE_AMOUNT);

//     // 3. 手动挖矿到解锁区块（确保已过锁仓期）
//     const currentBlock = await ethers.provider.getBlockNumber();
//     const blocksToMine = Number(unlockAt - BigInt(currentBlock)); 
//     await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]) // 挖到 unlockAt 区块;
    
//     const currentBlockAfterMine = await ethers.provider.getBlockNumber();
//     expect(currentBlockAfterMine).to.be.gte(unlockAt); // 确认已过锁仓期

//     // 4. 记录提取前的用户余额（用于验证到账）
//     const balanceBefore = await ethers.provider.getBalance(user1.address);

//     // 5. 执行提取操作
//     const withdrawTx = await stakeContract.connect(user1).withdraw();
//     const receipt = await withdrawTx.wait();

//     // 6. 计算提取后的实际到账金额（扣除gas费用）
//     const gasCost = receipt.gasUsed * receipt.gasPrice;
//     const balanceAfter = await ethers.provider.getBalance(user1.address);
//     expect(balanceAfter).to.equal(balanceBefore + lockedAmount - gasCost);

//     // 7. 验证用户状态：锁仓金额已清空
//     const userAfter = await stakeContract.users(user1.address);
//     expect(userAfter.locked).to.equal(0);

//     // 8. 验证提取事件是否正确触发
//     await expect(withdrawTx)
//       .to.emit(stakeContract, "Withdrawn") // 假设事件名为 Withdrawn
//       .withArgs(user1.address, lockedAmount);
//   });

//   it("no locked funds", async function () {
//     // 1. 获取当前区块号
//     const currentBlock = await ethers.provider.getBlockNumber();

//     // 2. 计算需要生成的区块数量，确保进入锁仓期内
//     const user = await stakeContract.users(user1.address);
//     const unlockAt = user.unlockAt;
//     const blocksToMine = Number(unlockAt - BigInt(currentBlock) - 2n); 

//     // 3. 挖矿（传入要生成的区块数量，十进制数字）
//     await ethers.provider.send("hardhat_mine", [blocksToMine.toString()]);

//     // 4. 验证结果
//     const afterMineBlock = await ethers.provider.getBlockNumber();
//     expect(afterMineBlock).to.equal(Number(unlockAt) - 2); // 确保仍在锁仓期内

//     // 5. 尝试提取，应被拒绝
//     await expect(
//       stakeContract.connect(user1).withdraw()
//     ).to.be.revertedWith("Withdraw: funds are still locked"); // 匹配合约中的错误提示

//     // 6. 验证状态未变：锁仓金额仍存在
//     const userAfter = await stakeContract.users(user1.address);
//     expect(userAfter.locked).to.equal(UNSTAKE_AMOUNT);
//   });

//   it("unlock period ended", async function () {
//     // 1. 先挖矿到解锁区块，提取全部锁仓资金
//     const user = await stakeContract.users(user1.address);
//     await ethers.provider.send("hardhat_mine", [user.unlockAt.toString()]);
//     await stakeContract.connect(user1).withdraw();

//     // 2. 再次尝试提取（此时锁仓金额已为0）
//     await expect(
//       stakeContract.connect(user1).withdraw()
//     ).to.be.revertedWith("Withdraw: no locked funds"); // 匹配合约中的错误提示

//     // 3. 验证其他用户（未发起赎回）也无法提取
//     await expect(
//       stakeContract.connect(owner).withdraw() // owner未质押/赎回，无锁仓资金
//     ).to.be.revertedWith("Withdraw: no locked funds");
//   });
// });