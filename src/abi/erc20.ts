export const ERC20_ABI = [
  { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"type":"uint8"}]},
  { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"a","type":"address"}],"outputs":[{"type":"uint256"}]},
  { "type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"o","type":"address"},{"name":"s","type":"address"}],"outputs":[{"type":"uint256"}]},
  { "type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"s","type":"address"},{"name":"a","type":"uint256"}],"outputs":[{"type":"bool"}]},
  { "type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"to","type":"address"},{"name":"a","type":"uint256"}],"outputs":[{"type":"bool"}]},
  { "type":"function","name":"transferFrom","stateMutability":"nonpayable","inputs":[{"name":"f","type":"address"},{"name":"t","type":"address"},{"name":"a","type":"uint256"}],"outputs":[{"type":"bool"}]}
] as const;
