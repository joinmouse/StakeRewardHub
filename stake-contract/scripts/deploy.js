// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  const LOCK_BLOCKS = 100n;
  console.log("部署合约，参数：", LOCK_BLOCKS);

  const MetaNodeStake = await hre.ethers.getContractFactory("MetaNodeStake");
  const contract = await MetaNodeStake.deploy(LOCK_BLOCKS);

  await contract.waitForDeployment();
  console.log("合约部署成功，地址：", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});