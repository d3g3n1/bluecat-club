// src/abi/BlueCatRaffle.ts
export const RAFFLE_ABI = [
  // ---- reads ----
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
  { "type": "function", "name": "feeBps",             "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "feeToStakersBps",    "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },
  { "type": "function", "name": "feeToTreasuryBps",   "stateMutability": "view", "inputs": [], "outputs": [{ "type": "uint256" }] },

  // ---- writes (front-end only needs buyTickets, but harmless to include others) ----
  { "type": "function", "name": "buyTickets",   "stateMutability": "nonpayable", "inputs": [{ "type": "uint256" }], "outputs": [] },
  { "type": "function", "name": "openRound",    "stateMutability": "nonpayable", "inputs": [{ "type": "uint256" }, { "type": "bytes32" }], "outputs": [] },
  { "type": "function", "name": "closeRound",   "stateMutability": "nonpayable", "inputs": [{ "type": "uint256" }], "outputs": [] },
  { "type": "function", "name": "finalizeRound","stateMutability": "nonpayable", "inputs": [{ "type": "uint256" }, { "type": "bytes32" }], "outputs": [] },

  // ---- events (critical for Winners) ----
  {
    "type": "event",
    "name": "RoundFinalized",
    "inputs": [
      { "indexed": true,  "name": "roundId",   "type": "uint256"   },
      { "indexed": false, "name": "winners",   "type": "address[5]" },  // <— fixed-size array
      { "indexed": false, "name": "prizePool", "type": "uint256"   },
      { "indexed": false, "name": "fee",       "type": "uint256"   },
      { "indexed": false, "name": "seed",      "type": "bytes32"   }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoundClosed",
    "inputs": [
      { "indexed": true,  "name": "roundId",  "type": "uint256" },
      { "indexed": false, "name": "pot",      "type": "uint256" },
      { "indexed": false, "name": "fee",      "type": "uint256" },
      { "indexed": false, "name": "prizePool","type": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoundOpened",
    "inputs": [
      { "indexed": true,  "name": "roundId",        "type": "uint256" },
      { "indexed": false, "name": "closeAt",        "type": "uint256" },
      { "indexed": false, "name": "serverSeedHash", "type": "bytes32" }
    ],
    "anonymous": false
  }
] as const;
