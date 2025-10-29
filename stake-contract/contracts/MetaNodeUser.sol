// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MetaNodeStakeStorage.sol";
import "./MetaNodeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract MetaNodeUser is PausableUpgradeable, MetaNodeStakeStorage {
    using SafeERC20 for IERC20;
    using MetaNodeMath for *;
    using Math for uint256;

    // 修饰符
    modifier checkPid(uint256 _pid) {
        require(_pid < pools.length, "invalid pid");
        _;
    }

    modifier whenNotClaimPaused() {
        require(!claimPaused, "claim is paused");
        _;
    }

    modifier whenNotWithdrawPaused() {
        require(!withdrawPaused, "withdraw is paused");
        _;
    }

    // 池数量查询函数
    function poolLength() external view returns (uint256) {
        return pools.length;
    }

    // 奖励乘数计算函数（基于区块范围）
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256 multiplier) {
        require(_from <= _to, "invalid block");
        if (_from < startBlock) _from = startBlock;
        if (_to > endBlock) _to = endBlock;
        require(_from <= _to, "end block must be greater than start block");
        return MetaNodeMath.getMultiplier(_from, _to, MetaNodePerBlock);
    }

    // 待领取奖励查询函数
    function pendingMetaNode(uint256 _pid, address _user) external checkPid(_pid) view returns (uint256) {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][_user];
        uint256 accMetaNodePerST = pool_.accMetaNodePerST;
        uint256 stSupply = pool_.stTokenAmount;

        if (block.number > pool_.lastRewardBlock && stSupply != 0) {
            uint256 multiplier = getMultiplier(pool_.lastRewardBlock, block.number);
            uint256 MetaNodeForPool = multiplier * pool_.poolWeight / totalPoolWeight;
            accMetaNodePerST += MetaNodeForPool * (1 ether) / stSupply;
        }

        return user_.stAmount * accMetaNodePerST / (1 ether) - user_.finishedMetaNode + user_.pendingMetaNode;
    }

    // 质押余额查询函数
    function stakingBalance(uint256 _pid, address _user) external checkPid(_pid) view returns (uint256) {
        return users[_pid][_user].stAmount;
    }

    // 赎回金额查询函数（区分已解锁和未解锁）
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

    // 单个池奖励更新函数
    function updatePool(uint256 _pid) public checkPid(_pid) {
        Pool storage pool_ = pools[_pid];
        if (block.number <= pool_.lastRewardBlock) return;

        uint256 multiplier = getMultiplier(pool_.lastRewardBlock, block.number);
        (bool success1, uint256 totalMetaNode) = multiplier.tryMul(pool_.poolWeight);
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

    // 批量ETH
    function depositETH() public payable whenNotPaused {
        Pool storage pool_ = pools[ETH_PID];
        require(pool_.stTokenAddress == address(0), "invalid staking token address");

        uint256 _amount = msg.value;
        require(_amount >= pool_.minDepositAmount, "deposit amount is too small");

        _deposit(ETH_PID, _amount);
    }

    // 质押ERC20
    function deposit(uint256 _pid, uint256 _amount) public whenNotPaused checkPid(_pid) {
        require(_pid != ETH_PID, "use depositETH for ETH staking");
        Pool storage pool_ = pools[_pid];
        require(_amount >= pool_.minDepositAmount, "deposit amount is too small");

        if (_amount > 0) {
            IERC20(pool_.stTokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
        }

        _deposit(_pid, _amount);
    }

    // 赎回申请函数
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

    // 提取函数
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
            MetaNodeMath.safeETHTransfer(msg.sender, pendingWithdraw);
        } else {
            IERC20(pool_.stTokenAddress).safeTransfer(msg.sender, pendingWithdraw);
        }

        emit Withdrawn(msg.sender, _pid, pendingWithdraw, block.number);
    }

    // 奖励领取函数
    function claim(uint256 _pid) public whenNotPaused checkPid(_pid) whenNotClaimPaused {
        Pool storage pool_ = pools[_pid];
        User storage user_ = users[_pid][msg.sender];

        updatePool(_pid); // 更新奖励状态

        uint256 pending = user_.stAmount * pool_.accMetaNodePerST / (1 ether) - user_.finishedMetaNode + user_.pendingMetaNode;
        require(pending > 0, "No rewards to claim");

        user_.pendingMetaNode = 0;
        user_.finishedMetaNode = user_.stAmount * pool_.accMetaNodePerST / (1 ether);

        MetaNodeMath.safeRewardTransfer(MetaNode, msg.sender, pending);
        emit RewardClaimed(msg.sender, _pid, pending);
    }

    // 内部质押逻辑函数
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

    // 批量更新所有池奖励函数
    function massUpdatePools() public virtual {
        for (uint256 pid = 0; pid < pools.length; pid++) {
            updatePool(pid);
        }
    }

    // 允许合约接收ETH
    receive() external payable {}
}