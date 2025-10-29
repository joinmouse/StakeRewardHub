// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../MetaNodeMath.sol"; // 引入你的库

contract MetaNodeMathTester {
    // 包装库的 safeETHTransfer 函数
    function testSafeETHTransfer(address to, uint256 amount) external payable {
        MetaNodeMath.safeETHTransfer(to, amount);
    }

    // 包装库的 safeRewardTransfer 函数
    function testSafeRewardTransfer(IERC20 token, address to, uint256 amount) external {
        MetaNodeMath.safeRewardTransfer(token, to, amount);
    }

    // 包装库的 getMultiplier 函数
    function testGetMultiplier(uint256 from, uint256 to, uint256 perBlock) external pure returns (uint256) {
        return MetaNodeMath.getMultiplier(from, to, perBlock);
    }
}