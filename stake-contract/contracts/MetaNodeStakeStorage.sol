// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ************************************** 常量定义 **************************************
bytes32 constant ADMIN_ROLE = keccak256("admin_role");
bytes32 constant UPGRADE_ROLE = keccak256("upgrade_role");
uint256 constant ETH_PID = 0;

// ************************************** 数据结构 **************************************
struct Pool {
    address stTokenAddress;       // 质押代币地址（ETH为address(0)）
    uint256 poolWeight;           // 池权重（用于分配跨池奖励）
    uint256 lastRewardBlock;      // 上次奖励计算区块
    uint256 accMetaNodePerST;     // 每单位质押累计奖励系数
    uint256 stTokenAmount;        // 总质押量
    uint256 minDepositAmount;     // 最小质押量
    uint256 unstakeLockedBlocks;  // 锁仓区块数
    address rewardToken;          // 奖励代币地址
    uint256 rewardRate;           // 每区块奖励率
}

struct User {
    uint256          stAmount;          // 当前质押量
    uint256          finishedMetaNode;  // 已结算奖励
    uint256          pendingMetaNode;   // 待领取奖励
    UnstakeRequest[] requests;          // 赎回请求队列
}
struct UnstakeRequest {
    uint256 amount;        // 赎回金额
    uint256 unlockBlocks;  // 解锁区块号
}

contract MetaNodeStakeStorage {
    // ************************************** 状态变量 **************************************
    Pool[] public pools;
    uint256 public totalPoolWeight;                             // 总池权重
    uint256 public startBlock;                                  // 奖励开始区块
    uint256 public endBlock;                                    // 奖励结束区块
    uint256 public MetaNodePerBlock;                            // 每区块奖励数量
    IERC20  public MetaNode;                                    // 奖励代币
    bool    public withdrawPaused;                              // 提现功能暂停标志
    bool    public claimPaused;                                 // 领取功能暂停标志
    mapping(uint256 => mapping(address => User)) public users;  // 池ID => 用户地址 => 用户信息映射

    // ************************************** 事件定义 **************************************
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
    event Staked(address indexed user, uint256 indexed poolId, uint256 amount);
    event RequestUnstaked(address indexed user, uint256 indexed poolId, uint256 amount, uint256 unlockBlocks);
    event Withdrawn(address indexed user, uint256 indexed poolId, uint256 amount, uint256 indexed blockNumber);
    event RewardClaimed(address indexed user, uint256 indexed poolId, uint256 MetaNodeReward);
}