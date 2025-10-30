require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("@openzeppelin/hardhat-upgrades"); 
require("dotenv").config();  // 加载环境变量(.env文件)

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {  // 注意：这里改为对象形式，包含版本和配置
    version: "0.8.28",
    settings: {  // settings 嵌套在 solidity 内部
      optimizer: {
        enabled: true,
        runs: 200   // 建议用200进一步压缩部署字节码
      },
      viaIR: true  // 新增 IR 优化，额外减少体积
    }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
  networks: {
    // 本地开发网络(无需私钥,Hardhat自动生成账户)
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY], // 从环境变量加载私钥
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY, // 从环境变量加载Etherscan API Key
  }
};