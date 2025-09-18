// src/abi/BlueCatRaffle.ts
export const RAFFLE_ABI = [
  // -------- reads --------
  { "type": "function", "name": "ticketPrice", "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "currentRound", "stateMutability": "view", "inputs": [], "outputs": [
    { "type": "uint256" }, // id
    { "type": "uint256" }, // openAt
    { "type": "uint256" }, // closeAt
    { "type": "uint256" }, // pot
    { "type": "bool"    }, // closed
    { "type": "bool"    }  // drawn
  ]},
  { "type": "function", "name": "getUserTickets", "stateMutability": "view", "inputs": [
    { "type": "uint256" }, { "type": "address" }
  ], "outputs": [{ "type": "uint256" }] },

  // fee config (public getters)
  { "type": "function", "name": "feeBps", "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "feeToStakersBps", "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "feeToTreasuryBps", "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },

  // -------- writes --------
  { "type": "function", "name": "buyTickets", "stateMutability": "nonpayable", "inputs": [{ "type": "uint256" }], "outputs": [] },

  // -------- events (needed by Winners.tsx) --------
  {
    "type": "event",
    "name": "RoundFinalized",
    "inputs": [
      { "indexed": true,  "name": "roundId",   "type": "uint256" },
      { "indexed": false, "name": "winners",   "type": "address[5]" },
      { "indexed": false, "name": "prizePool", "type": "uint256" },
      { "indexed": false, "name": "fee",       "type": "uint256" },
      { "indexed": false, "name": "seed",      "type": "bytes32" }
    ]
  }
] as const;
