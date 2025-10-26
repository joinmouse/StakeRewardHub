// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MetaNodeStake {
    // 状态变量：记录总质押量和用户质押量
    uint256 public totalStaked; // 全局总质押ETH
    mapping(address => uint256) public userStake; // 用户质押量

    // 事件：质押行为
    event Staked(address indexed user, uint256 amount);

    // 质押函数，用户调用此函数进行质押
    function stake() external payable {
        require(msg.value > 0, "Stake amount must be greater than zero");

        // 更新用户质押量和全局总质押量
        userStake[msg.sender] += msg.value;
        totalStaked += msg.value;

        emit Staked(msg.sender, msg.value);
    }
}