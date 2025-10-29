  // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MetaNodeStakeStorage.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract MetaNodeAdmin is AccessControlUpgradeable, PausableUpgradeable, MetaNodeStakeStorage {
    // 修饰符: 检查传入的 _pid 参数是否有效
    modifier checkPidAdmin(uint256 _pid) {
        require(_pid < pools.length, "invalid pid");
        _;
    }

    // 管理员设置奖励代币函数
    function setMetaNode(IERC20 _MetaNode) public onlyRole(ADMIN_ROLE) {
        MetaNode = _MetaNode;
        emit SetMetaNode(MetaNode);
    }

    // 细粒度暂停控制函数
    function pauseWithdraw() public onlyRole(ADMIN_ROLE) {
        require(!withdrawPaused, "withdraw has been already paused");
        withdrawPaused = true;
        emit PauseWithdraw();
    }
    // 恢复提现功能
    function unpauseWithdraw() public onlyRole(ADMIN_ROLE) {
        require(withdrawPaused, "withdraw has been already unpaused");
        withdrawPaused = false;
        emit UnpauseWithdraw();
    }
    // 暂停领取功能
    function pauseClaim() public onlyRole(ADMIN_ROLE) {
        require(!claimPaused, "claim has been already paused");
        claimPaused = true;
        emit PauseClaim();
    }
    // 恢复领取功能
    function unpauseClaim() public onlyRole(ADMIN_ROLE) {
        require(claimPaused, "claim has been already unpaused");
        claimPaused = false;
        emit UnpauseClaim();
    }

    // 设置开始区块函数
    function setStartBlock(uint256 _startBlock) public onlyRole(ADMIN_ROLE) {
        require(_startBlock <= endBlock, "start block must be smaller than end block");
        startBlock = _startBlock;
        emit SetStartBlock(_startBlock);
    }
    // 设置结束区块函数
    function setEndBlock(uint256 _endBlock) public onlyRole(ADMIN_ROLE) {
        require(startBlock <= _endBlock, "start block must be smaller than end block");
        endBlock = _endBlock;
        emit SetEndBlock(_endBlock);
    }
    // 设置每区块奖励函数
    function setMetaNodePerBlock(uint256 _MetaNodePerBlock) public onlyRole(ADMIN_ROLE) {
        require(_MetaNodePerBlock > 0, "invalid parameter");
        MetaNodePerBlock = _MetaNodePerBlock;
        emit SetMetaNodePerBlock(_MetaNodePerBlock);
    }

    // 添加池函数
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
            massUpdatePools();  // 批量更新所有池的奖励状态
        }

        uint256 lastRewardBlock  = block.number > startBlock ? block.number : startBlock;
                totalPoolWeight += _poolWeight;

        pools.push(Pool({
            stTokenAddress     : _stTokenAddress,
            poolWeight         : _poolWeight,
            lastRewardBlock    : lastRewardBlock,
            accMetaNodePerST   : 0,
            stTokenAmount      : 0,
            minDepositAmount   : _minDepositAmount,
            unstakeLockedBlocks: _unstakeLockedBlocks,
            rewardToken        : _rewardToken,
            rewardRate         : _rewardRate
        }));

        emit AddPool(_stTokenAddress, _poolWeight, lastRewardBlock, _minDepositAmount, _unstakeLockedBlocks);
    }

    // 池信息更新函数
    function updatePoolInfo(uint256 _pid, uint256 _minDepositAmount, uint256 _unstakeLockedBlocks) 
        public 
        onlyRole(ADMIN_ROLE) 
        checkPidAdmin(_pid) 
    {
        pools[_pid].minDepositAmount    = _minDepositAmount;
        pools[_pid].unstakeLockedBlocks = _unstakeLockedBlocks;
        emit UpdatePoolInfo(_pid, _minDepositAmount, _unstakeLockedBlocks);
    }

    // 池权重调整函数
    function setPoolWeight(uint256 _pid, uint256 _poolWeight, bool _withUpdate) 
        public 
        onlyRole(ADMIN_ROLE) 
        checkPidAdmin(_pid)
    {
        require(_poolWeight > 0, "invalid pool weight");
        if (_withUpdate) {
            massUpdatePools();
        }
              totalPoolWeight  = totalPoolWeight - pools[_pid].poolWeight + _poolWeight;
        pools[_pid].poolWeight = _poolWeight;
        emit SetPoolWeight(_pid, _poolWeight, totalPoolWeight);
    }

    // 批量更新所有池奖励函数
    function massUpdatePools() public virtual;

    // 内部添加池函数（供初始化使用）
    function _addPool(
        address _stTokenAddress,
        uint256 _poolWeight,
        uint256 _unstakeLockedBlocks,
        address _rewardToken,
        uint256 _rewardRate
    ) internal {
        uint256 lastRewardBlock  = block.number > startBlock ? block.number : startBlock;
                totalPoolWeight += _poolWeight;

        pools.push(Pool({
            stTokenAddress     : _stTokenAddress,
            poolWeight         : _poolWeight,
            lastRewardBlock    : lastRewardBlock,
            accMetaNodePerST   : 0,
            stTokenAmount      : 0,
            minDepositAmount   : 0,
            unstakeLockedBlocks: _unstakeLockedBlocks,
            rewardToken        : _rewardToken,
            rewardRate         : _rewardRate
        }));
    }
}