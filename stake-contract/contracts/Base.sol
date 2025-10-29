// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

// +++++++++ 替换权限和暂停机制为可升级版本
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
// --------- 移除原有的非可升级权限和暂停机制
// import "@openzeppelin/contracts/access/Ownable2Step.sol";
// import "@openzeppelin/contracts/utils/Pausable.sol";
// import "hardhat/console.sol";

// +++++++++ 继承可升级相关合约，移除Ownable2Step和Pausable
contract MetaNodeStake is
    Initializable,
    UUPSUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable
{
    using SafeERC20 for IERC20;
    using Address for address;  // +++++++++ 新增Address库用于ETH转账安全校验
    using Math for uint256;    // +++++++++ 新增Math库用于数学运算

    // ************************************** 常量定义 **************************************
    // +++++++++ 新增角色定义和ETH池固定ID
    bytes32 public constant ADMIN_ROLE = keccak256("admin_role");
    bytes32 public constant UPGRADE_ROLE = keccak256("upgrade_role");
    uint256 public constant ETH_PID = 0;
    // --------- 移除原有奖励开关（通过暂停机制替代）
    // bool public rewardEnabled = false;

    // ************************************** 数据结构 **************************************
    // +++++++++ 扩展Pool结构体，增加奖励计算相关字段
    struct Pool {
        address stTokenAddress;  // 质押代币地址（ETH为address(0)）
        uint256 poolWeight;      // 池权重（用于分配跨池奖励）
        uint256 lastRewardBlock; // 上次奖励计算区块
        uint256 accMetaNodePerST;// 每单位质押累计奖励系数
        uint256 stTokenAmount;   // 总质押量
        uint256 minDepositAmount;// 最小质押量
        uint256 unstakeLockedBlocks; // 锁仓区块数
        address rewardToken;     // 奖励代币地址
        uint256 rewardRate;      // 每区块奖励率
    }

    // +++++++++ 新增赎回请求结构体（支持多次赎回）
    struct UnstakeRequest {
        uint256 amount;          // 赎回金额
        uint256 unlockBlocks;    // 解锁区块号
    }

    // +++++++++ 扩展User结构体，支持奖励累计和赎回队列
    struct User {
        uint256 stAmount;        // 当前质押量
        uint256 finishedMetaNode;// 已结算奖励
        uint256 pendingMetaNode; // 待领取奖励
        UnstakeRequest[] requests; // 赎回请求队列
        // --------- 移除原有锁仓字段（改用requests队列）
        // uint256 locked;
        // uint256 unlockAt;
        // uint256 lastRewardBlock;
        // uint256 accruedRewards;
    }

    // ************************************** 状态变量 **************************************
    // +++++++++ 新增奖励周期相关变量
    uint256 public startBlock;  // 奖励开始区块
    uint256 public endBlock;    // 奖励结束区块
    uint256 public MetaNodePerBlock; // 每区块基础奖励量

    // +++++++++ 细粒度暂停开关
    bool public withdrawPaused; // 提取功能暂停
    bool public claimPaused;    // 奖励领取暂停

    // +++++++++ 奖励代币全局变量（替代原pool内的rewardToken）
    IERC20 public MetaNode;

    // +++++++++ 总池权重（用于跨池奖励分配）
    uint256 public totalPoolWeight;
    Pool[] public pools;        // 质押池列表

    // +++++++++ 调整映射结构，与新合约一致
    mapping(uint256 => mapping(address => User)) public users;
    // --------- 移除原有tokenToPoolId映射（通过遍历或外部维护替代）

    // ************************************** 事件定义 **************************************
    // +++++++++ 新增管理员操作事件
    event SetMetaNode(IERC20 indexed MetaNode);
    event PauseWithdraw();
    event UnpauseWithdraw();
    event PauseClaim();
    event UnpauseClaim();
    event SetStartBlock(uint256 indexed startBlock);
    event SetEndBlock(uint256 indexed endBlock);
    event SetMetaNodePerBlock(uint256 indexed MetaNodePerBlock);
    event AddPool(address indexed stTokenAddress, uint256 indexed poolWeight, uint256 indexed lastRewardBlock, uint256 minDepositAmount, uint256 unstakeLockedBlocks);
    event UpdatePoolInfo(uint256 indexed poolId, uint256 indexed minDepositAmount, uint256 indexed unstakeLockedBlocks);
    event SetPoolWeight(uint256 indexed poolId, uint256 indexed poolWeight, uint256 totalPoolWeight);
    event UpdatePool(uint256 indexed poolId, uint256 indexed lastRewardBlock, uint256 totalMetaNode);

    // +++++++++ 调整原有事件参数，与新合约一致
    event Staked(address indexed user, uint256 indexed poolId, uint256 amount);
    event RequestUnstaked(address indexed user, uint256 indexed poolId, uint256 amount, uint256 unlockBlocks);
    event Withdrawn(address indexed user, uint256 indexed poolId, uint256 amount, uint256 indexed blockNumber);
    event RewardClaimed(address indexed user, uint256 indexed poolId, uint256 MetaNodeReward);

    // ************************************** 修饰符 **************************************
    // +++++++++ 新增池ID校验修饰符
    modifier checkPid(uint256 _pid) {
        require(_pid < pools.length, "invalid pid");
        _;
    }

    // +++++++++ 细粒度暂停修饰符
    modifier whenNotClaimPaused() {
        require(!claimPaused, "claim is paused");
        _;
    }

    modifier whenNotWithdrawPaused() {
        require(!withdrawPaused, "withdraw is paused");
        _;
    }

    // ************************************** 初始化函数（替代构造函数） **************************************
    // +++++++++ 用initializer替代constructor，支持可升级初始化
    function initialize(
        IERC20 _MetaNode,
        uint256 _startBlock,
        uint256 _endBlock,
        uint256 _MetaNodePerBlock,
        uint256 _ethLockBlocks,
        uint256 _ethRewardRate
    ) public initializer {
        require(_startBlock <= _endBlock && _MetaNodePerBlock > 0, "invalid parameters");
        require(_ethLockBlocks > 0, "Invalid lock blocks");
        require(address(_MetaNode) != address(0), "Invalid reward token");
        require(_ethRewardRate > 0, "Invalid reward rate");

        // 初始化升级和权限系统
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __Pausable_init();  // +++++++++ 初始化暂停机制
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADE_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        MetaNode = _MetaNode;
        startBlock = _startBlock;
        endBlock = _endBlock;
        MetaNodePerBlock = _MetaNodePerBlock;

        // 初始化ETH池（第一个池固定为ETH池）
        _addPool(
            address(0),          // ETH地址
            100,                 // 初始权重
            _ethLockBlocks,      // 锁仓区块
            _MetaNode,           // 奖励代币
            _ethRewardRate       // 奖励率
        );
    }

    // +++++++++ 实现UUPS升级授权
    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADE_ROLE)
        override
    {}

    // ************************************** 管理员函数 **************************************
    // +++++++++ 新增管理员设置奖励代币函数
    function setMetaNode(IERC20 _MetaNode) public onlyRole(ADMIN_ROLE) {
        MetaNode = _MetaNode;
        emit SetMetaNode(MetaNode);
    }

    // +++++++++ 细粒度暂停控制函数
    function pauseWithdraw() public onlyRole(ADMIN_ROLE) {
        require(!withdrawPaused, "withdraw has been already paused");
        withdrawPaused = true;
        emit PauseWithdraw();
    }

    function unpauseWithdraw() public onlyRole(ADMIN_ROLE) {
        require(withdrawPaused, "withdraw has been already unpaused");
        withdrawPaused = false;
        emit UnpauseWithdraw();
    }

    function pauseClaim() public onlyRole(ADMIN_ROLE) {
        require(!claimPaused, "claim has been already paused");
        claimPaused = true;
        emit PauseClaim();
    }

    function unpauseClaim() public onlyRole(ADMIN_ROLE) {
        require(claimPaused, "claim has been already unpaused");
        claimPaused = false;
        emit UnpauseClaim();
    }

    // +++++++++ 新增奖励周期调整函数
    function setStartBlock(uint256 _startBlock) public onlyRole(ADMIN_ROLE) {
        require(_startBlock <= endBlock, "start block must be smaller than end block");
        startBlock = _startBlock;
        emit SetStartBlock(_startBlock);
    }

    function setEndBlock(uint256 _endBlock) public onlyRole(ADMIN_ROLE) {
        require(startBlock <= _endBlock, "start block must be smaller than end block");
        endBlock = _endBlock;
        emit SetEndBlock(_endBlock);
    }

    function setMetaNodePerBlock(uint256 _MetaNodePerBlock) public onlyRole(ADMIN_ROLE) {
        require(_MetaNodePerBlock > 0, "invalid parameter");
        MetaNodePerBlock = _MetaNodePerBlock;
        emit SetMetaNodePerBlock(_MetaNodePerBlock);
    }

    // +++++++++ 重写添加池函数，支持权重和初始化奖励计算
    function addPool(
        address _stTokenAddress,
        uint256 _poolWeight,
        uint256 _minDepositAmount,
        uint256 _unstakeLockedBlocks,
        address _rewardToken,
        uint256 _rewardRate,
        bool _withUpdate
    ) public onlyRole(ADMIN_ROLE) {
        // 校验：第一个池必须是ETH池，后续池不能是ETH
        if (pools.length > 0) {
            require(_stTokenAddress != address(0), "invalid staking token address");
        } else {
            require(_stTokenAddress == address(0), "invalid staking token address");
        }
        require(_unstakeLockedBlocks > 0, "invalid withdraw locked blocks");
        require(block.number < endBlock, "Already ended");

        if (_withUpdate) {
            massUpdatePools(); // 批量更新所有池的奖励状态
        }

        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalPoolWeight += _poolWeight;

        pools.push(Pool({
            stTokenAddress: _stTokenAddress,
            poolWeight: _poolWeight,
            lastRewardBlock: lastRewardBlock,
            accMetaNodePerST: 0,
            stTokenAmount: 0,
            minDepositAmount: _minDepositAmount,
            unstakeLockedBlocks: _unstakeLockedBlocks,
            rewardToken: _rewardToken,
            rewardRate: _rewardRate
        }));

        emit AddPool(_stTokenAddress, _poolWeight, lastRewardBlock, _minDepositAmount, _unstakeLockedBlocks);
    }

    // +++++++++ 新增池信息更新函数
    function updatePoolInfo(uint256 _pid, uint256 _minDepositAmount, uint256 _unstakeLockedBlocks) 
        public 
        onlyRole(ADMIN_ROLE) 
        checkPid(_pid) 
    {
        pools[_pid].minDepositAmount = _minDepositAmount;
        pools[_pid].unstakeLockedBlocks = _unstakeLockedBlocks;
        emit UpdatePoolInfo(_pid, _minDepositAmount, _unstakeLockedBlocks);
    }

    // +++++++++ 新增池权重调整函数
    function setPoolWeight(uint256 _pid, uint256 _poolWeight, bool _withUpdate) 
        public 
        onlyRole(ADMIN_ROLE) 
        checkPid(_pid) 
    {
        require(_poolWeight > 0, "invalid pool weight");
        if (_withUpdate) {
            massUpdatePools();
        }
        totalPoolWeight = totalPoolWeight - pools[_pid].poolWeight + _poolWeight;
        pools[_pid].poolWeight = _poolWeight;
        emit SetPoolWeight(_pid, _poolWeight, totalPoolWeight);
    }

    // ************************************** 查询函数 **************************************
    // +++++++++ 新增池数量查询函数
    function poolLength() external view returns (uint256) {
        return pools.length;
    }

    // +++++++++ 新增奖励乘数计算函数（基于区块范围）
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256 multiplier) {
        require(_from <= _to, "invalid block");
        if (_from < startBlock) _from = startBlock;
        if (_to > endBlock) _to = endBlock;
        require(_from <= _to, "end block must be greater than start block");
        (bool success, uint256 result) = (_to - _from).tryMul(MetaNodePerBlock);
        require(success, "multiplier overflow");
        multiplier = result;
    }

    // +++++++++ 新增待领取奖励查询函数
    function pendingMetaNode(uint256 _pid, address _user) external checkPid(_pid) view returns (uint256) {
        return pendingMetaNodeByBlockNumber(_pid, _user, block.number);
    }

    function pendingMetaNodeByBlockNumber(uint256 _pid, address _user, uint256 _blockNumber) 
        public 
        checkPid(_pid) 
        view 
        returns (uint256) 
    {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][_user];
        uint256 accMetaNodePerST = pool_.accMetaNodePerST;
        uint256 stSupply = pool_.stTokenAmount;

        if (_blockNumber > pool_.lastRewardBlock && stSupply != 0) {
            uint256 multiplier = getMultiplier(pool_.lastRewardBlock, _blockNumber);
            uint256 MetaNodeForPool = multiplier * pool_.poolWeight / totalPoolWeight;
            accMetaNodePerST += MetaNodeForPool * (1 ether) / stSupply;
        }

        return user_.stAmount * accMetaNodePerST / (1 ether) - user_.finishedMetaNode + user_.pendingMetaNode;
    }

    // +++++++++ 新增质押余额查询函数
    function stakingBalance(uint256 _pid, address _user) external checkPid(_pid) view returns (uint256) {
        return users[_pid][_user].stAmount;
    }

    // +++++++++ 新增赎回金额查询函数（区分已解锁和未解锁）
    function withdrawAmount(uint256 _pid, address _user) 
        public 
        checkPid(_pid) 
        view 
        returns (uint256 requestAmount, uint256 pendingWithdrawAmount) 
    {
        User storage user_ = users[_pid][_user];
        for (uint256 i = 0; i < user_.requests.length; i++) {
            if (user_.requests[i].unlockBlocks <= block.number) {
                pendingWithdrawAmount += user_.requests[i].amount;
            }
            requestAmount += user_.requests[i].amount;
        }
    }

    // ************************************** 核心业务函数 **************************************
    // +++++++++ 新增单个池奖励更新函数
    function updatePool(uint256 _pid) public checkPid(_pid) {
        Pool storage pool_ = pools[_pid];
        if (block.number <= pool_.lastRewardBlock) return;

        (bool success1, uint256 totalMetaNode) = getMultiplier(pool_.lastRewardBlock, block.number).tryMul(pool_.poolWeight);
        require(success1, "overflow");
        (success1, totalMetaNode) = totalMetaNode.tryDiv(totalPoolWeight);
        require(success1, "overflow");

        uint256 stSupply = pool_.stTokenAmount;
        if (stSupply > 0) {
            (bool success2, uint256 totalMetaNode_) = totalMetaNode.tryMul(1 ether);
            require(success2, "overflow");
            (success2, totalMetaNode_) = totalMetaNode_.tryDiv(stSupply);
            require(success2, "overflow");
            (bool success3, uint256 accMetaNodePerST) = pool_.accMetaNodePerST.tryAdd(totalMetaNode_);
            require(success3, "overflow");
            pool_.accMetaNodePerST = accMetaNodePerST;
        }

        pool_.lastRewardBlock = block.number;
        emit UpdatePool(_pid, pool_.lastRewardBlock, totalMetaNode);
    }

    // +++++++++ 新增批量更新所有池奖励函数
    function massUpdatePools() public {
        for (uint256 pid = 0; pid < pools.length; pid++) {
            updatePool(pid);
        }
    }

    // +++++++++ 拆分质押函数为ETH和ERC20单独处理
    function depositETH() public payable whenNotPaused {
        Pool storage pool_ = pools[ETH_PID];
        require(pool_.stTokenAddress == address(0), "invalid staking token address");

        uint256 _amount = msg.value;
        require(_amount >= pool_.minDepositAmount, "deposit amount is too small");

        _deposit(ETH_PID, _amount);
    }

    function deposit(uint256 _pid, uint256 _amount) public whenNotPaused checkPid(_pid) {
        require(_pid != ETH_PID, "use depositETH for ETH staking");
        Pool storage pool_ = pools[_pid];
        require(_amount >= pool_.minDepositAmount, "deposit amount is too small");

        if (_amount > 0) {
            IERC20(pool_.stTokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
        }

        _deposit(_pid, _amount);
    }

    // +++++++++ 内部质押逻辑函数
    function _deposit(uint256 _pid, uint256 _amount) internal {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][msg.sender];

        updatePool(_pid); // 更新奖励状态

        if (user_.stAmount > 0) {
            (bool success1, uint256 accST) = user_.stAmount.tryMul(pool_.accMetaNodePerST);
            require(success1, "user stAmount mul overflow");
            (success1, accST) = accST.tryDiv(1 ether);
            require(success1, "accST div overflow");
            
            (bool success2, uint256 pending) = accST.trySub(user_.finishedMetaNode);
            require(success2, "pending reward underflow");

            if (pending > 0) {
                user_.pendingMetaNode += pending;
            }
        }

        if (_amount > 0) {
            user_.stAmount += _amount;
            pool_.stTokenAmount += _amount;
        }

        (bool success3, uint256 finished) = user_.stAmount.tryMul(pool_.accMetaNodePerST);
        require(success3, "finished reward mul overflow");
        (success3, finished) = finished.tryDiv(1 ether);
        require(success3, "finished reward div overflow");
        user_.finishedMetaNode = finished;

        emit Staked(msg.sender, _pid, _amount);
    }

    // +++++++++ 重写赎回申请函数，支持多次申请（队列存储）
    function unstake(uint256 _pid, uint256 _amount) public whenNotPaused checkPid(_pid) whenNotWithdrawPaused {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][msg.sender];

        require(user_.stAmount >= _amount, "Not enough staking balance");
        require(_amount > 0, "amount must be > 0");

        updatePool(_pid); // 更新奖励状态

        // 计算待领取奖励
        uint256 pending = user_.stAmount * pool_.accMetaNodePerST / (1 ether) - user_.finishedMetaNode;
        if (pending > 0) {
            user_.pendingMetaNode += pending;
        }

        // 更新质押量和赎回队列
        user_.stAmount -= _amount;
        user_.requests.push(UnstakeRequest({
            amount: _amount,
            unlockBlocks: block.number + pool_.unstakeLockedBlocks
        }));
        pool_.stTokenAmount -= _amount;

        // 更新已结算奖励
        user_.finishedMetaNode = user_.stAmount * pool_.accMetaNodePerST / (1 ether);

        emit RequestUnstaked(msg.sender, _pid, _amount, block.number + pool_.unstakeLockedBlocks);
    }

    // +++++++++ 重写提取函数，支持批量处理已解锁的赎回申请
    function withdraw(uint256 _pid) public whenNotPaused checkPid(_pid) whenNotWithdrawPaused {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][msg.sender];

        uint256 pendingWithdraw;
        uint256 popNum;

        // 统计可提取金额并记录数量
        for (uint256 i = 0; i < user_.requests.length; i++) {
            if (user_.requests[i].unlockBlocks > block.number) break;
            pendingWithdraw += user_.requests[i].amount;
            popNum++;
        }

        require(pendingWithdraw > 0, "Withdraw: no locked funds");

        // 移除已提取的申请（保持队列顺序）
        for (uint256 i = 0; i < user_.requests.length - popNum; i++) {
            user_.requests[i] = user_.requests[i + popNum];
        }
        for (uint256 i = 0; i < popNum; i++) {
            user_.requests.pop();
        }

        // 转账提取金额
        if (pool_.stTokenAddress == address(0)) {
            _safeETHTransfer(msg.sender, pendingWithdraw);
        } else {
            IERC20(pool_.stTokenAddress).safeTransfer(msg.sender, pendingWithdraw);
        }

        emit Withdrawn(msg.sender, _pid, pendingWithdraw, block.number);
    }

    // +++++++++ 重写奖励领取函数
    function claim(uint256 _pid) public whenNotPaused checkPid(_pid) whenNotClaimPaused {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][msg.sender];

        updatePool(_pid); // 更新奖励状态

        uint256 pending = user_.stAmount * pool_.accMetaNodePerST / (1 ether) - user_.finishedMetaNode + user_.pendingMetaNode;
        require(pending > 0, "No rewards to claim");

        user_.pendingMetaNode = 0;
        user_.finishedMetaNode = user_.stAmount * pool_.accMetaNodePerST / (1 ether);

        _safeMetaNodeTransfer(msg.sender, pending);
        emit RewardClaimed(msg.sender, _pid, pending);
    }

    // ************************************** 内部工具函数 **************************************
    // +++++++++ 安全转账奖励代币
    function _safeMetaNodeTransfer(address _to, uint256 _amount) internal {
        uint256 bal = MetaNode.balanceOf(address(this));
        if (_amount > bal) {
            MetaNode.transfer(_to, bal);
        } else {
            MetaNode.transfer(_to, _amount);
        }
    }

    // +++++++++ 安全转账ETH
    function _safeETHTransfer(address _to, uint256 _amount) internal {
        (bool success, bytes memory data) = _to.call{value: _amount}("");
        require(success, "ETH transfer failed");
        if (data.length > 0) {
            require(abi.decode(data, (bool)), "ETH transfer failed");
        }
    }

    // +++++++++ 允许合约接收ETH
    receive() external payable {}
}