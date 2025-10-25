// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MetaNodeStake {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakeToken;

    mapping(address => uint256) private _stakes;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);

    constructor(IERC20 _stakeToken) {
        stakeToken = _stakeToken;
    }

    function stake(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        _stakes[msg.sender] += amount;
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");
        require(_stakes[msg.sender] >= amount, "Insufficient staked balance");
        _stakes[msg.sender] -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function stakeOf(address user) external view returns (uint256) {
        return _stakes[user];
    }
}