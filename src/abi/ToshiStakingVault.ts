export const TOSHI_VAULT_ABI = [
  { "type":"function","name":"stake","stateMutability":"nonpayable","inputs":[{"type":"uint256"}],"outputs":[] },
  { "type":"function","name":"unstake","stateMutability":"nonpayable","inputs":[{"type":"uint256"}],"outputs":[] },
  { "type":"function","name":"claimToshi","stateMutability":"nonpayable","inputs":[],"outputs":[] },
  { "type":"function","name":"pendingToshi","stateMutability":"view","inputs":[{"type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"function","name":"staked","stateMutability":"view","inputs":[{"type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"function","name":"totalStaked","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}] }
] as const;
