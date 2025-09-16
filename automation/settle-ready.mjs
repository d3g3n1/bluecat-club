
import 'dotenv/config';
import fs from 'fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const RAFFLE = process.env.RAFFLE_ADDRESS;
const RPC = process.env.RPC_URL;
const PK = process.env.ADMIN_PRIVATE_KEY;
if (!RAFFLE || !RPC || !PK) throw new Error('Missing env (.env.admin)');

const RAFFLE_ABI = [
  { name:'roundId', inputs:[], outputs:[{type:'uint256'}], stateMutability:'view', type:'function' },
  { name:'rounds', inputs:[{type:'uint256'}],
    outputs:[{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'bytes32'},{type:'bytes32'},{type:'bool'},{type:'bool'}],
    stateMutability:'view', type:'function' },
  { name:'closeRound', inputs:[{type:'uint256'}], outputs:[], stateMutability:'nonpayable', type:'function' },
  { name:'finalizeRound', inputs:[{type:'uint256'},{type:'bytes32'}], outputs:[], stateMutability:'nonpayable', type:'function' },
];

const path = './automation/secrets.json';
let db = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path,'utf-8')) : {};

const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: base, transport: http(RPC) });

const id = await pub.readContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'roundId' });
const r = await pub.readContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'rounds', args: [id] });
const closeAt = Number(r[2]);
const closed  = r[8];
const drawn   = r[9];
const now = Math.floor(Date.now()/1000);

if (drawn) { console.log('Already finalized.'); process.exit(0); }
if (now < closeAt) { console.log('Too early: closeAt', closeAt); process.exit(0); }

if (!closed) {
  console.log('Closing round', id.toString());
  await wallet.writeContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'closeRound', args: [id] });
}

const entry = db[id.toString()];
if (!entry || !entry.secret) throw new Error('No secret saved for round '+id);
console.log('Finalizing with saved secret.');
await wallet.writeContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'finalizeRound', args: [id, entry.secret] });
console.log('Done.');
