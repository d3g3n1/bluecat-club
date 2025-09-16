// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IVault { function notifyReward(uint256 amount) external; }

contract BlueCatRaffle {
    struct Round {
        uint256 id; uint256 openAt; uint256 closeAt; uint256 pot;
        uint256 fee; uint256 prizePool; bytes32 serverSeedHash; bytes32 randomSeed;
        bool closed; bool drawn;
    }
    address public owner; IERC20 public immutable toshi;
    uint256 public ticketPrice = 10_000 ether; uint256 public feeBps = 500;
    address public treasury; address public stakingVault; uint256 public feeToStakersBps = 6000; uint256 public feeToTreasuryBps = 4000;
    uint256 public roundId; mapping(uint256=>Round) public rounds;
    mapping(uint256=>mapping(address=>uint256)) public tickets; mapping(uint256=>address[]) public participants; mapping(uint256=>mapping(address=>bool)) internal seen;
    address[5] public lastWinners; modifier onlyOwner(){ require(msg.sender==owner, '!owner'); _; }
    constructor(address _toshi, address _treasury){ owner = msg.sender; toshi = IERC20(_toshi); treasury = _treasury; }
    function setParams(uint256 _ticketPrice, uint256 _feeBps) external onlyOwner { ticketPrice=_ticketPrice; feeBps=_feeBps; }
    function setFeeSplit(uint256 s, uint256 t) external onlyOwner { require(s+t==10_000,'sum!=100%'); feeToStakersBps=s; feeToTreasuryBps=t; }
    function setVault(address v) external onlyOwner { stakingVault=v; }
    function setTreasury(address t) external onlyOwner { treasury=t; }
    function openRound(uint256 closeAt, bytes32 h) external onlyOwner {
        require(closeAt>block.timestamp,'closeAt in past'); roundId+=1;
        rounds[roundId]=Round(roundId, block.timestamp, closeAt, 0,0,0,h,bytes32(0),false,false);
        emit RoundOpened(roundId, closeAt, h);
    }
    function currentRound() external view returns (uint256,uint256,uint256,uint256,bool,bool) {
        Round storage r=rounds[roundId]; return (r.id,r.openAt,r.closeAt,r.pot,r.closed,r.drawn);
    }
    function getUserTickets(uint256 id,address u) external view returns(uint256){ return tickets[id][u]; }
    function getProjectedPayouts(uint256 pot) external view returns(uint256,uint256,uint256,uint256,uint256){
        uint256 fee=(pot*feeBps)/10_000; uint256 prize=pot-fee;
        return ((prize*45)/100,(prize*25)/100,(prize*15)/100,(prize*10)/100,(prize*5)/100);
    }
    function buyTickets(uint256 n) external { require(n>0,'count=0'); Round storage r=rounds[roundId]; require(block.timestamp<r.closeAt&&!r.closed,'round closed');
        uint256 cost=ticketPrice*n; require(toshi.transferFrom(msg.sender,address(this),cost),'transferFrom'); r.pot+=cost;
        if(!seen[roundId][msg.sender]){ participants[roundId].push(msg.sender); seen[roundId][msg.sender]=true; }
        tickets[roundId][msg.sender]+=n; emit TicketsBought(roundId,msg.sender,n,cost);
    }
    function closeRound(uint256 id) external onlyOwner { Round storage r=rounds[id]; require(!r.closed,'closed'); require(block.timestamp>=r.closeAt,'early'); r.closed=true; r.fee=(r.pot*feeBps)/10_000; r.prizePool=r.pot-r.fee; emit RoundClosed(id,r.pot,r.fee,r.prizePool); }
    function finalizeRound(uint256 id, bytes32 s) external onlyOwner {
        Round storage r=rounds[id]; require(r.closed&&!r.drawn,'bad'); require(keccak256(abi.encodePacked(s))==r.serverSeedHash,'seed');
        bytes32 seed=keccak256(abi.encodePacked(s,blockhash(block.number-1))); r.randomSeed=seed;
        address[5] memory W=_drawWinners(id,seed); _payoutWinners(W,r.prizePool);
        uint256 toS=(r.fee*feeToStakersBps)/10_000; uint256 toT=r.fee-toS;
        if(toS>0 && stakingVault!=address(0)){ require(toshi.transfer(stakingVault,toS),'fee->vault'); IVault(stakingVault).notifyReward(toS); }
        if(toT>0 && treasury!=address(0)){ require(toshi.transfer(treasury,toT),'fee->treasury'); }
        lastWinners=W; r.drawn=true; emit RoundFinalized(id,W,r.prizePool,r.fee,seed);
    }
    function _totalTickets(uint256 id) internal view returns(uint tot){ address[] storage L=participants[id]; for(uint i=0;i<L.length;i++) tot+=tickets[id][L[i]]; }
    function _pick(address[] storage L,uint256 id,uint pick) internal returns(address c,uint tC){ uint acc=0; for(uint j=0;j<L.length;j++){ uint t=tickets[id][L[j]]; if(t==0) continue; acc+=t; if(pick<acc){ c=L[j]; tC=t; tickets[id][c]=0; return(c,tC);} } return(address(0),0); }
    function _drawWinners(uint256 id, bytes32 seed) internal returns(address[5] memory W){ address[] storage L=participants[id]; uint rem=_totalTickets(id); require(rem>0,'no tickets'); bytes32 cur=seed; uint d=0;
        while(d<5 && rem>0){ cur=keccak256(abi.encodePacked(cur,d)); uint pick=uint(cur)%rem; (address c,uint tC)=_pick(L,id,pick); if(c==address(0)) break; W[d]=c; rem=(tC<=rem)?(rem-tC):0; d++; } }
    function _payoutWinners(address[5] memory W,uint prize) internal { if(prize==0) return; uint p1=(prize*45)/100; uint p2=(prize*25)/100; uint p3=(prize*15)/100; uint p4=(prize*10)/100; uint p5=(prize*5)/100;
        if(W[0]!=address(0)) require(IERC20(toshi).transfer(W[0],p1),'pay1'); if(W[1]!=address(0)) require(IERC20(toshi).transfer(W[1],p2),'pay2'); if(W[2]!=address(0)) require(IERC20(toshi).transfer(W[2],p3),'pay3'); if(W[3]!=address(0)) require(IERC20(toshi).transfer(W[3],p4),'pay4'); if(W[4]!=address(0)) require(IERC20(toshi).transfer(W[4],p5),'pay5'); }
    event RoundOpened(uint256 indexed roundId,uint256 closeAt,bytes32 serverSeedHash);
    event TicketsBought(uint256 indexed roundId,address indexed user,uint256 count,uint256 cost);
    event RoundClosed(uint256 indexed roundId,uint256 pot,uint256 fee,uint256 prizePool);
    event RoundFinalized(uint256 indexed roundId,address[5] winners,uint256 prizePool,uint256 fee,bytes32 seed);
}
