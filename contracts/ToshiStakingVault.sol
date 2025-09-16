// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/**
 * @title ToshiStakingVault
 * @notice Single-token staking vault: users stake TOSHI and earn TOSHI.
 * @dev Raffle transfers TOSHI here, then calls notifyReward(amount).
 */
contract ToshiStakingVault {
    IERC20 public immutable toshi;
    address public owner;
    address public raffle;

    uint256 public totalStaked;
    mapping(address => uint256) public staked;

    uint256 public accToshiPerShare;
    mapping(address => uint256) public debt;
    mapping(address => uint256) public pending;

    modifier onlyOwner(){ require(msg.sender == owner, "!owner"); _; }
    modifier onlyRaffle(){ require(msg.sender == raffle, "!raffle"); _; }

    constructor(address _toshi){ owner = msg.sender; toshi = IERC20(_toshi); }

    function setRaffle(address _raffle) external onlyOwner { raffle = _raffle; emit RaffleSet(_raffle); }

    function stake(uint256 amount) external {
        require(amount > 0, "amt=0");
        _harvest(msg.sender);
        require(toshi.transferFrom(msg.sender, address(this), amount), "transferFrom");
        staked[msg.sender] += amount; totalStaked += amount;
        debt[msg.sender] = staked[msg.sender] * accToshiPerShare / 1e18;
        emit Staked(msg.sender, amount);
    }
    function unstake(uint256 amount) external {
        require(amount > 0 && amount <= staked[msg.sender], "bad amt");
        _harvest(msg.sender);
        staked[msg.sender] -= amount; totalStaked -= amount;
        debt[msg.sender] = staked[msg.sender] * accToshiPerShare / 1e18;
        require(toshi.transfer(msg.sender, amount), "transfer");
        emit Unstaked(msg.sender, amount);
    }
    function claimToshi() external {
        _harvest(msg.sender);
        uint256 v = pending[msg.sender]; pending[msg.sender] = 0;
        require(toshi.transfer(msg.sender, v), "claim");
        emit Claimed(msg.sender, v);
    }
    function pendingToshi(address user) external view returns (uint256){
        uint256 accrued = staked[user] * accToshiPerShare / 1e18;
        if (accrued < debt[user]) return pending[user];
        return pending[user] + (accrued - debt[user]);
    }
    function notifyReward(uint256 amount) external onlyRaffle {
        if (amount == 0 || totalStaked == 0) return;
        accToshiPerShare += amount * 1e18 / totalStaked;
        emit RewardNotified(amount);
    }
    function _harvest(address user) internal {
        uint256 accrued = staked[user] * accToshiPerShare / 1e18;
        if (accrued >= debt[user]) pending[user] += (accrued - debt[user]);
        debt[user] = staked[user] * accToshiPerShare / 1e18;
    }
    event RaffleSet(address raffle);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event RewardNotified(uint256 amount);
}
