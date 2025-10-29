// const { expect } = require("chai");
// const { ethers } = require("hardhat");

// describe("MetaNodeStake - 质押功能测试", function () {
//   // 合约与代币实例
//   let metaNodeStake;       // 质押合约实例
//   let metaNodeToken;       // MetaNodeToken实例（同时作为质押和奖励代币）
  
//   // 角色地址
//   let owner;               // 合约部署者（管理员）
//   let user1;               // 测试用户1
//   let user2;               // 测试用户2
  
//   // 配置常量
//   const ETH_LOCK_BLOCKS = 10;    // ETH质押池锁仓区块数
//   const ERC20_LOCK_BLOCKS = 20;  // ERC20质押池锁仓区块数
//   const ETH_POOL_ID = 0;         // ETH池默认ID（构造函数初始化）
//   let erc20PoolId;               // ERC20池动态ID
//   let metaNodeTokenAddress;      // 代币地址

//   // ======== 部署与初始化 ========
//   before(async function () {
//     // 获取签名者
//     [owner, user1, user2] = await ethers.getSigners();
    
//     // 部署MetaNodeToken合约
//     const MetaNodeToken = await ethers.getContractFactory("MetaNodeToken");
//     metaNodeToken = await MetaNodeToken.deploy();
//     await metaNodeToken.waitForDeployment();
//     metaNodeTokenAddress = await metaNodeToken.getAddress();
//   });

//   beforeEach(async function () {
//     // 部署质押合约（每次测试前重新部署，避免状态污染）
//     const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
//     metaNodeStake = await MetaNodeStake.deploy(
//       ETH_LOCK_BLOCKS, 
//       metaNodeTokenAddress,  // ETH池奖励代币
//       100                    // ETH池奖励率
//     );
//     await metaNodeStake.waitForDeployment();

//     // 添加ERC20质押池（质押和奖励均为MetaNodeToken）
//     await metaNodeStake.addPool(
//       metaNodeTokenAddress,  // 质押代币
//       ERC20_LOCK_BLOCKS,     // 锁仓区块数
//       metaNodeTokenAddress,  // 奖励代币
//       200                    // ERC20池奖励率
//     );
    
//     // 获取ERC20池ID
//     erc20PoolId = Number(await metaNodeStake.getPoolCount()) - 1;
    
//     // 充值奖励代币到合约
//     const rewardAmount = ethers.parseEther("10000");
//     await metaNodeToken.transfer(await metaNodeStake.getAddress(), rewardAmount);
//     await metaNodeStake.setRewardEnabled(true);
//   });

//   // ======== 辅助函数 ========
//   /**
//    * 获取用户在指定池的质押数据
//    * @param {number} poolId - 池ID
//    * @param {Signer} user - 用户签名者
//    * @returns {Promise<Object>} 用户数据对象
//    */
//   const getUserData = async (poolId, user) => {
//     return metaNodeStake.users(poolId, await user.getAddress());
//   };

//   /**
//    * 获取指定池的总质押量
//    * @param {number} poolId - 池ID
//    * @returns {Promise<bigint>} 总质押量
//    */
//   const getPoolTotalStaked = async (poolId) => {
//     const pool = await metaNodeStake.pools(poolId);
//     return pool.totalStaked;
//   };

//   /**
//    * 快速挖矿指定数量的区块
//    * @param {number} blocks - 区块数量
//    */
//   const mineBlocks = async (blocks) => {
//     for (let i = 0; i < blocks; i++) {
//       await ethers.provider.send("evm_mine", []);
//     }
//   };

//   // ======== 测试用例 ========
//   describe("合约初始化验证", function () {
//     it("应正确初始化ETH池和ERC20池的基本参数", async function () {
//       // 验证ETH池
//       const ethPool = await metaNodeStake.pools(ETH_POOL_ID);
//       expect(ethPool.token).to.equal(ethers.ZeroAddress, "ETH池地址应为0地址");
//       expect(ethPool.lockBlocks).to.equal(ETH_LOCK_BLOCKS, "ETH池锁仓期错误");
//       expect(ethPool.rewardToken).to.equal(metaNodeTokenAddress, "ETH池奖励代币错误");

//       // 验证ERC20池
//       const erc20Pool = await metaNodeStake.pools(erc20PoolId);
//       expect(erc20Pool.token).to.equal(metaNodeTokenAddress, "ERC20池质押代币错误");
//       expect(erc20Pool.lockBlocks).to.equal(ERC20_LOCK_BLOCKS, "ERC20池锁仓期错误");
//       expect(erc20Pool.rewardToken).to.equal(metaNodeTokenAddress, "ERC20池奖励代币错误");
//     });

//     it("tokenToPoolId映射应正确关联代币与池ID", async function () {
//       expect(Number(await metaNodeStake.tokenToPoolId(ethers.ZeroAddress)))
//         .to.equal(ETH_POOL_ID + 1, "ETH池ID映射错误");
      
//       expect(Number(await metaNodeStake.tokenToPoolId(metaNodeTokenAddress)))
//         .to.equal(erc20PoolId + 1, "ERC20池ID映射错误");
//     });
//   });

//   describe("ETH质押功能", function () {
//     const stakeAmount = ethers.parseEther("1.0");

//     it("质押0金额应触发错误", async function () {
//       await expect(
//         metaNodeStake.connect(user1).stake(ETH_POOL_ID, 0, { value: 0 })
//       ).to.be.revertedWith("Amount must > 0");
//     });

//     it("正常质押ETH应更新状态并触发事件", async function () {
//       // 执行质押
//       const tx = metaNodeStake.connect(user1).stake(ETH_POOL_ID, stakeAmount, { 
//         value: stakeAmount 
//       });

//       // 验证事件
//       await expect(tx)
//         .to.emit(metaNodeStake, "Staked")
//         .withArgs(await user1.getAddress(), ETH_POOL_ID, stakeAmount);

//       // 验证用户状态
//       const userData = await getUserData(ETH_POOL_ID, user1);
//       expect(userData.staked).to.equal(stakeAmount, "用户质押量错误");
      
//       // 验证池总质押量
//       expect(await getPoolTotalStaked(ETH_POOL_ID)).to.equal(
//         stakeAmount, 
//         "池总质押量错误"
//       );

//       // 验证合约ETH余额
//       const contractBalance = await ethers.provider.getBalance(
//         await metaNodeStake.getAddress()
//       );
//       expect(contractBalance).to.equal(stakeAmount, "合约ETH余额错误");
//     });

//     it("同一用户多次质押ETH应累加金额", async function () {
//       const amount1 = ethers.parseEther("0.5");
//       const amount2 = ethers.parseEther("0.8");
//       const total = amount1 + amount2;

//       // 首次质押
//       await metaNodeStake.connect(user1).stake(ETH_POOL_ID, amount1, { value: amount1 });
//       // 二次质押
//       await metaNodeStake.connect(user1).stake(ETH_POOL_ID, amount2, { value: amount2 });

//       // 验证用户累计质押
//       expect((await getUserData(ETH_POOL_ID, user1)).staked).to.equal(
//         total, 
//         "用户累计质押错误"
//       );

//       // 验证池总质押
//       expect(await getPoolTotalStaked(ETH_POOL_ID)).to.equal(
//         total, 
//         "池累计质押错误"
//       );
//     });

//     it("多用户质押ETH应分别记录数据", async function () {
//       const user1Amount = ethers.parseEther("1.2");
//       const user2Amount = ethers.parseEther("2.3");
//       const total = user1Amount + user2Amount;

//       // 用户1质押
//       await metaNodeStake.connect(user1).stake(ETH_POOL_ID, user1Amount, { value: user1Amount });
//       // 用户2质押
//       await metaNodeStake.connect(user2).stake(ETH_POOL_ID, user2Amount, { value: user2Amount });

//       // 验证用户1数据
//       expect((await getUserData(ETH_POOL_ID, user1)).staked).to.equal(
//         user1Amount, 
//         "用户1质押量错误"
//       );

//       // 验证用户2数据
//       expect((await getUserData(ETH_POOL_ID, user2)).staked).to.equal(
//         user2Amount, 
//         "用户2质押量错误"
//       );

//       // 验证总质押
//       expect(await getPoolTotalStaked(ETH_POOL_ID)).to.equal(
//         total, 
//         "总质押量错误"
//       );
//     });
//   });

//   describe("ERC20质押功能", function () {
//     const stakeAmount = ethers.parseEther("100");

//     it("未授权代币质押应触发错误", async function () {
//       await expect(
//         metaNodeStake.connect(user1).stake(erc20PoolId, stakeAmount)
//       ).to.be.reverted;
//     });

//     it("正常质押ERC20应更新状态并触发事件", async function () {
//       // 转账并授权
//       await metaNodeToken.transfer(await user1.getAddress(), stakeAmount);
//       await metaNodeToken.connect(user1).approve(
//         await metaNodeStake.getAddress(), 
//         stakeAmount
//       );

//       // 执行质押
//       const tx = metaNodeStake.connect(user1).stake(erc20PoolId, stakeAmount);

//       // 验证事件
//       await expect(tx)
//         .to.emit(metaNodeStake, "Staked")
//         .withArgs(await user1.getAddress(), erc20PoolId, stakeAmount);

//       // 验证用户状态
//       const userData = await getUserData(erc20PoolId, user1);
//       expect(userData.staked).to.equal(stakeAmount, "用户质押量错误");

//       // 验证池总质押
//       expect(await getPoolTotalStaked(erc20PoolId)).to.equal(
//         stakeAmount, 
//         "池总质押量错误"
//       );

//       // 验证合约代币余额
//       const contractBalance = await metaNodeToken.balanceOf(
//         await metaNodeStake.getAddress()
//       );
//       expect(contractBalance).to.equal(stakeAmount + ethers.parseEther("10000"), "合约代币余额错误"); // 包含奖励池余额
//     });

//     it("多池质押数据应相互隔离", async function () {
//       // ETH质押
//       const ethAmount = ethers.parseEther("1.0");
//       await metaNodeStake.connect(user1).stake(ETH_POOL_ID, ethAmount, { value: ethAmount });

//       // ERC20质押
//       const erc20Amount = ethers.parseEther("100");
//       await metaNodeToken.transfer(await user1.getAddress(), erc20Amount);
//       await metaNodeToken.connect(user1).approve(
//         await metaNodeStake.getAddress(), 
//         erc20Amount
//       );
//       await metaNodeStake.connect(user1).stake(erc20PoolId, erc20Amount);

//       // 验证ETH池数据
//       expect((await getUserData(ETH_POOL_ID, user1)).staked).to.equal(
//         ethAmount, 
//         "ETH池用户数据错误"
//       );
//       expect(await getPoolTotalStaked(ETH_POOL_ID)).to.equal(
//         ethAmount, 
//         "ETH池总质押错误"
//       );

//       // 验证ERC20池数据
//       expect((await getUserData(erc20PoolId, user1)).staked).to.equal(
//         erc20Amount, 
//         "ERC20池用户数据错误"
//       );
//       expect(await getPoolTotalStaked(erc20PoolId)).to.equal(
//         erc20Amount, 
//         "ERC20池总质押错误"
//       );
//     });
//   });
// });