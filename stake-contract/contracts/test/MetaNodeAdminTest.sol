// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../MetaNodeAdmin.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "hardhat/console.sol";

contract MetaNodeAdminTest is Initializable, MetaNodeAdmin {
    // 初始化函数：调用所有父类的初始化方法
    function initialize() external initializer {
        __AccessControl_init();                      // 初始化AccessControlUpgradeable
        __Pausable_init();                           // 初始化PausableUpgradeable
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);  // 授予部署者管理员角色
    }

    // 实现抽象函数（简单模拟批量更新）
    function massUpdatePools() public virtual override {
        // 测试用：仅更新第一个池的最后奖励区块
        if (pools.length > 0) {
            pools[0].lastRewardBlock = block.number;
        }
    }

    // 暴露内部函数供测试（如 _addPool）
    function testAddPool(
        address _stTokenAddress,
        uint256 _poolWeight,
        uint256 _unstakeLockedBlocks,
        address _rewardToken,
        uint256 _rewardRate
    ) external {
        _addPool(_stTokenAddress, _poolWeight, _unstakeLockedBlocks, _rewardToken, _rewardRate);
    }
}