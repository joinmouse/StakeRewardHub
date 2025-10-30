require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("@openzeppelin/hardhat-upgrades"); 

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
};