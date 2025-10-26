// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

contract MetaNodeStake {
    // 状态变量：记录总质押量和用户质押量
    uint256 public totalStaked; // 全局总质押ETH量

    // 锁仓区块数, 用区块数换算的锁仓时间（部署时指定，不可修改）, 例如: 锁仓100个区块，约15-20分钟（以太坊每区块约12-15秒）
    uint256 public immutable lockBlocks;

    // 用户状态结构体：记录单个用户的质押、锁仓信息
    struct User {
        uint256 staked;    // 当前质押中的ETH数量
        uint256 locked;    // 锁仓是“资金暂存”, 记录某用户有多少资金在等待提取
        uint256 unlockAt;  // 锁仓结束的区块号（用区块数换算的锁仓时间, 来标记什么时候能提取）
    }
    mapping(address => User) public users;  // 用户状态映射

    event Staked(address indexed user, uint256 amount);  // 质押事件
    event RequestUnstaked(address indexed user, uint256 amount, uint256 unlockAt); // 赎回申请事件
    event Withdrawn(address indexed user, uint256 amount); // 提取事件

    // 部署时设置锁仓区块数，确保规则固定
    constructor(uint256 _lockBlocks) {
        require(_lockBlocks > 0, "Invalid lock blocks");
        lockBlocks = _lockBlocks;
    }

    // 1、质押函数，用户调用此函数进行质押
    function stake() external payable {
        require(msg.value > 0, "Stake amount must be greater than zero");
        User storage user = users[msg.sender];

        // 更新用户质押量和全局总质押量
        user.staked += msg.value;
        totalStaked += msg.value;

        emit Staked(msg.sender, msg.value);
    }

    // 2、赎回申请函数, 用户调用此函数申请解除质押
    function requestUnstake(uint256 amount) external {
        User storage user = users[msg.sender];

        require(amount > 0, "Unstake: amount must be > 0");
        require(user.staked >= amount, "Unstake: not enough");

        user.staked -= amount;
        user.locked += amount;
        // 新增：计算解锁时间（当前区块 + 锁仓区块数）
        user.unlockAt = block.number + lockBlocks;
        totalStaked -= amount;

        emit RequestUnstaked(msg.sender, amount, user.unlockAt);
    }

    // 3、提取函数, 用户调用此函数提取已解锁的资金
    function withdraw() external {
        User storage user = users[msg.sender];
        require(user.locked > 0, "Withdraw: no locked funds");  // 确认有锁仓资金
        require(block.number >= user.unlockAt, "Withdraw: funds are still locked");  // 确认锁仓时间已到

        uint256 amount = user.locked;
        user.locked = 0;   // 清空锁仓资金
        
        (bool success, ) = msg.sender.call{value: amount}("");  // 提取: 发送ETH给用户
        require(success, "Withdraw: transfer failed");

        // 新增：触发提取事件（阶段2无此事件）
        emit Withdrawn(msg.sender, amount);
    }
}