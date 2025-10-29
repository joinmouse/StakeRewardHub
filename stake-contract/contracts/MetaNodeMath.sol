// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

library MetaNodeMath {
    using Address for address;
    using SafeERC20 for IERC20;
    using Math for uint256;

    // 安全ETH转账
    function safeETHTransfer(address _to, uint256 _amount) internal {
        (bool success, bytes memory data) = _to.call{value: _amount}("");
        require(success, "ETH transfer failed");
        if (data.length > 0) {
            require(abi.decode(data, (bool)), "ETH transfer failed");
        }
    }

    // 安全奖励代币转账
    function safeRewardTransfer(IERC20 _rewardToken, address _to, uint256 _amount) internal {
        uint256 bal = _rewardToken.balanceOf(address(this));
        if (_amount > bal) {
            _rewardToken.transfer(_to, bal);
        } else {
            _rewardToken.transfer(_to, _amount);
        }
    }

    // 计算奖励乘数（防溢出）
    function getMultiplier(uint256 _from, uint256 _to, uint256 _metaNodePerBlock) internal pure returns (uint256) {
        require(_from <= _to, "invalid block range");
        (bool success, uint256 result) = (_to - _from).tryMul(_metaNodePerBlock);
        require(success, "multiplier overflow");
        return result;
    }
}
