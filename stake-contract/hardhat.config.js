require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  settings: {
    optimizer: {
      enabled: true, // 启用优化器
      runs: 200      // 优化目标：假设合约会被调用200次（数值越低，部署字节码越小）
    }
  }
};
