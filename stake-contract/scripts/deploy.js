const { ethers, upgrades } = require("hardhat");

async function main() {
  // 部署参数配置
  const DEPLOY_PARAMS = {
    startBlockOffset: 100, // 奖励开始区块 = 当前区块 + 100
    endBlockOffset: 100000, // 奖励结束区块 = 开始区块 + 100000
    metaNodePerBlock: ethers.parseEther("10"), // 每区块奖励10枚
    ethLockBlocks: 1000, // ETH锁仓区块数
    ethRewardRate: 100, // ETH池奖励率
  };

  console.log("=== 开始部署完整流程 ===");
  console.log("部署参数:", DEPLOY_PARAMS);

  // --------------------------
  // 1. 部署 MetaNodeToken 代币
  // --------------------------
  console.log("\n1. 部署 MetaNodeToken 代币...");
  const MetaNodeToken = await ethers.getContractFactory("MetaNodeToken");
  const metaNodeToken = await MetaNodeToken.deploy();
  await metaNodeToken.waitForDeployment();
  const tokenAddress = await metaNodeToken.getAddress();
  console.log("✅ 代币部署完成，地址:", tokenAddress);

  // --------------------------
  // 2. 计算质押合约的区块参数
  // --------------------------
  const blockNumber = await ethers.provider.getBlockNumber();
  const startBlock = blockNumber + DEPLOY_PARAMS.startBlockOffset;
  const endBlock = startBlock + DEPLOY_PARAMS.endBlockOffset;
  console.log("\n计算区块参数:");
  console.log("当前区块:", blockNumber);
  console.log("奖励开始区块:", startBlock);
  console.log("奖励结束区块:", endBlock);

  // --------------------------
  // 3. 部署可升级质押合约
  // --------------------------
  console.log("\n2. 部署 MetaNodeStake 质押合约...");
  const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");

  // 部署UUPS可升级合约
  const metaNodeStakeProxy = await upgrades.deployProxy(
    MetaNodeStake,
    [
      tokenAddress, // 奖励代币地址（刚部署的MetaNodeToken）
      startBlock,
      endBlock,
      DEPLOY_PARAMS.metaNodePerBlock,
      DEPLOY_PARAMS.ethLockBlocks,
      DEPLOY_PARAMS.ethRewardRate,
    ],
    {
      initializer: "initialize",
      kind: "uups",
    }
  );
  
  await metaNodeStakeProxy.waitForDeployment();
  const proxyAddress = await metaNodeStakeProxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("✅ 质押合约部署完成:");
  console.log("代理合约地址（交互入口）:", proxyAddress);
  console.log("实现合约地址（逻辑）:", implementationAddress);
  console.log("管理员地址:", (await ethers.getSigners())[0].address);

  // --------------------------
  // 4. 向质押合约转账奖励代币（可选）
  // --------------------------
  const rewardAmount = ethers.parseEther("100000"); // 转入10万枚作为奖励储备
  console.log(`\n3. 向质押合约转账 ${ethers.formatEther(rewardAmount)} 枚奖励代币...`);
  const transferTx = await metaNodeToken.transfer(proxyAddress, rewardAmount);
  await transferTx.wait();
  console.log("✅ 转账完成，质押合约奖励代币余额:", ethers.formatEther(await metaNodeToken.balanceOf(proxyAddress)));

  // --------------------------
  // 5. 验证合约（测试网支持）
  // --------------------------
  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "localhost") {
    console.log("\n4. 等待区块确认后验证合约...");
    await new Promise(resolve => setTimeout(resolve, 60000)); // 等待1分钟

    // 验证代币合约
    await hre.run("verify:verify", {
      address: tokenAddress,
      constructorArguments: [],
    });

    // 验证质押实现合约
    await hre.run("verify:verify", {
      address: implementationAddress,
      constructorArguments: [], // 实现合约无构造函数
    });

    console.log("✅ 所有合约验证完成！");
  }

  console.log("\n=== 部署流程全部完成 ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("部署失败:", error);
    process.exit(1);
  });