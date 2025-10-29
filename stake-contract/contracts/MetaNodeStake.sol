// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MetaNodeStakeStorage.sol";
import "./MetaNodeAdmin.sol";
import "./MetaNodeUser.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MetaNodeStake is Initializable, UUPSUpgradeable, MetaNodeAdmin, MetaNodeUser {
    // 初始化函数（替代构造函数）
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
        __Pausable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADE_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        MetaNode = _MetaNode;
        startBlock = _startBlock;
        endBlock = _endBlock;
        MetaNodePerBlock = _MetaNodePerBlock;
        withdrawPaused = false;
        claimPaused = false;

        // 初始化ETH池（第一个池固定为ETH池）
        _addPool(
            address(0),          // ETH地址
            100,                 // 初始权重
            _ethLockBlocks,      // 锁仓区块
            address(MetaNode),   // 奖励代币
            _ethRewardRate       // 奖励率
        );
    }

    // 实现UUPS升级授权
    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADE_ROLE)
        override
    {}

    // 重写批量更新函数，确保使用MetaNodeUser中的实现
    function massUpdatePools() public override(MetaNodeAdmin, MetaNodeUser) {
        MetaNodeUser.massUpdatePools();
    }
}