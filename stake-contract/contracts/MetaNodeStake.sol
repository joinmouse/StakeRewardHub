// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol"; // 更安全的权限管理（支持所有权转移确认）
import "@openzeppelin/contracts/utils/Pausable.sol"; // 紧急暂停机制
import "hardhat/console.sol";

contract MetaNodeStake is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    // 状态变量：记录总质押量和用户质押量
    uint256 public totalStaked; // 全局总质押ETH量

    // 锁仓区块数, 锁仓区块数从immutable改为可调整（由管理员控制）
    uint256 public lockBlocks;

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
    event LockBlocksUpdated(uint256 newLockBlocks); // 锁仓区块数更新事件(用于链下监控)

    // 部署时设置锁仓区块数，确保规则固定
    constructor(uint256 _lockBlocks) Ownable(msg.sender){
        require(_lockBlocks > 0, "Invalid lock blocks");
        lockBlocks = _lockBlocks;
    }

    // 管理员函数：更新锁仓区块数(仅允许增大，保护现有用户权益)
    function setLockBlocks(uint256 _newLockBlocks) external onlyOwner {
        require(_newLockBlocks > lockBlocks, "New lock blocks must be larger than current");
        lockBlocks = _newLockBlocks;
        emit LockBlocksUpdated(_newLockBlocks);
    }
    // 管理员函数：暂停合约（紧急情况下使用）
    function pause() external onlyOwner {
        _pause();   // 调用Pausable的暂停函数
    }
    // 管理员函数：解除暂停
    function unpause() external onlyOwner {
        _unpause();  // 调用Pausable的解除暂停函数
    }

    // 1、质押函数，用户调用此函数进行质押(whenNotPaused修饰符 暂停时不允许质押)
    function stake() external payable whenNotPaused {
        require(msg.value > 0, "Stake amount must be greater than zero");
        User storage user = users[msg.sender];

        // 更新用户质押量和全局总质押量
        user.staked += msg.value;
        totalStaked += msg.value;

        emit Staked(msg.sender, msg.value);
    }

    // 2、赎回申请函数, 用户调用此函数申请解除质押(暂停时不允许赎回)
    function requestUnstake(uint256 amount) external whenNotPaused {
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

    // 3、提取函数, 用户调用此函数提取已解锁的资金(暂停时不允许提取)
    function withdraw() external whenNotPaused {
        User storage user = users[msg.sender];
        require(user.locked > 0, "Withdraw: no locked funds");  // 确认有锁仓资金
        require(block.number >= user.unlockAt, "Withdraw: funds are still locked");  // 确认锁仓时间已到

        uint256 amount = user.locked;
        user.locked = 0;   // 清空锁仓资金

        // 保障合约有足够余额支付提取请求, 避免合约余额不足
        require(address(this).balance >= amount, "Withdraw: contract balance insufficient");

        (bool success, ) = msg.sender.call{value: amount}("");  // 提取: 发送ETH给用户,带返回值检查
        require(success, "Withdraw: transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // 允许合约接收ETH
    receive() external payable {}
}