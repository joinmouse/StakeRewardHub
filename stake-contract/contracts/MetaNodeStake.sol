// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol"; // 更安全的权限管理（支持所有权转移确认）
import "@openzeppelin/contracts/utils/Pausable.sol"; // 紧急暂停机制
import "hardhat/console.sol";

contract MetaNodeStake is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;  // 使用SafeERC20库安全操作ERC20代币

    // ***质押池: 管理单种资产的质押信息
    struct Pool {
        address token;        // 质押的代币地址（ETH为address(0)）
        uint256 totalStaked;  // 该池子中的总质押量
        uint256 lockBlocks;   // 该池子的锁仓区块数
    }
    // ***用户状态结构体：记录单个用户的质押、锁仓信息
    struct User {
        uint256 staked;    // 当前质押量
        uint256 locked;    // 锁仓是金额
        uint256 unlockAt;  // 锁仓结束的区块号（用区块数换算的锁仓时间, 来标记什么时候能提取）
    }

    // *** 状态变量
    Pool[] public pools;  // 质押池列表(按照ID索引)
    // 资产→池ID映射：快速查询某资产对应的池ID（避免遍历数组）
    mapping(address => uint256) public totalToPoolId;
    // 池ID→用户地址→用户状态映射
    mapping(uint256 => mapping(address => User)) public users;

    // ***事件
    event Staked(address indexed user, uint256 poolId, uint256 amount);  // 质押事件
    event RequestUnstaked(address indexed user, uint256 poolId, uint256 amount, uint256 unlockAt); // 赎回申请事件
    event Withdrawn(address indexed user, uint256 poolId, uint256 amount); // 提取事件
    event PoolAdded(address indexed token, uint256 poolId, uint256 lockBlocks); // 新增池子事件

    // 部署时设置锁仓区块数，确保规则固定
    constructor(uint256 _lockBlocks) Ownable(msg.sender){
        require(_lockBlocks > 0, "Invalid lock blocks");
        _addPool(address(0), _lockBlocks);  // 添加ETH质押池
    }

    // ==================== 管理员功能：添加新池 ====================
    // 管理员函数：添加新ERC20质押池
    function addPool(address _token, uint256 _lockBlocks) external onlyOwner {
        require(_token != address(0), "Token address cannot be zero");  // ETH池请使用专门函数
        require(totalToPoolId[_token] == 0, "Pool for this token already exists"); // 防止重复添加
        require(_lockBlocks > 0, "Lock blocks must be greater than zero");  // 默认设置的锁仓区块数必须大于0
        _addPool(_token, _lockBlocks);
    }

    // 内部函数：添加池子逻辑
    function _addPool(address _token, uint256 _lockBlocks) internal {
        uint256 poolId = pools.length;
        pools.push(Pool({
            token: _token,
            totalStaked: 0,
            lockBlocks: _lockBlocks
        }));
        totalToPoolId[_token] = poolId + 1; // 池ID从1开始，0表示不存在
        emit PoolAdded(_token, poolId, _lockBlocks);
    }

    // 管理员函数：暂停合约（紧急情况下使用）
    function pause() external onlyOwner {
        _pause();   // 调用Pausable的暂停函数
    }
    // 管理员函数：解除暂停
    function unpause() external onlyOwner {
        _unpause();  // 调用Pausable的解除暂停函数
    }

    // 1、质押函数(ETH/ERC20), 用户调用此函数进行质押(whenNotPaused修饰符 暂停时不允许质押)
    function stake(uint256 _poolId, uint256 _amount) external payable whenNotPaused {
        require(_poolId < pools.length, "Invalid pool ID"); // 验证池ID有效性
        require(_amount > 0, "Amount must > 0");  // 质押数量必须大于0
        Pool storage pool = pools[_poolId];

        // 处理资产转账
        if (pool.token == address(0)) {  // ETH质押
            require(msg.value == _amount, "ETH value mismatch");
        } else {
            require(msg.value == 0, "Do not send ETH for ERC20 stake");
            IERC20(pool.token).safeTransferFrom(msg.sender, address(this), _amount);  // ERC20质押
        }

        // 更新用户质押量和全局总质押量
        User storage user = users[_poolId][msg.sender];
        user.staked += _amount;
        pool.totalStaked += _amount;

        emit Staked(msg.sender, _poolId, _amount);  // 触发质押事件
    }

    // 2、赎回申请函数, 用户调用此函数申请解除质押(暂停时不允许赎回)
    function requestUnstake(uint256 _poolId, uint256 _amount) external whenNotPaused {
        require(_poolId < pools.length, "Invalid pool ID"); // 验证池ID有效性
        Pool storage pool = pools[_poolId];
        User storage user = users[_poolId][msg.sender];

        require(_amount > 0, "Unstake: amount must be > 0");  // 赎回数量必须大于0
        require(user.staked >= _amount, "Unstake: not enough"); // 确认用户有足够质押量

        user.staked -= _amount;
        user.locked += _amount;
        user.unlockAt = block.number + pool.lockBlocks;  // 设置解锁区块号
        pool.totalStaked -= _amount;

        emit RequestUnstaked(msg.sender, _poolId, _amount, user.unlockAt);
    }

    // 3、提取函数, 用户调用此函数提取已解锁的资金(暂停时不允许提取)
    function withdraw(uint256 _poolId) external whenNotPaused {
        require(_poolId < pools.length, "Invalid pool ID"); // 验证池ID有效性
        Pool storage pool = pools[_poolId];
        User storage user = users[_poolId][msg.sender];

        require(user.locked > 0, "Withdraw: no locked funds");  // 确认有锁仓资金
        require(block.number >= user.unlockAt, "Withdraw: funds are still locked");  // 确认锁仓时间已到

        uint256 amount = user.locked;
        user.locked = 0;   // 清空锁仓资金

        if (pool.token == address(0)) {  // ETH提取
            // 保障合约有足够余额支付提取请求, 避免合约余额不足
            require(address(this).balance >= amount, "Withdraw: contract balance insufficient");
            (bool success, ) = msg.sender.call{value: amount}("");  // 提取: 发送ETH给用户,带返回值检查
            require(success, "Withdraw: transfer failed");
        } else {  // ERC20提取
            IERC20(pool.token).safeTransfer(msg.sender, amount);  // 使用SafeERC20安全转账
        }

        emit Withdrawn(msg.sender, _poolId, amount);
    }

    // 允许合约接收ETH
    receive() external payable {}
}