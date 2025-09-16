
import 'dotenv/config';
import fs from 'fs';
import { createPublicClient, createWalletClient, http, keccak256, toHex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { zonedTimeToUtc } from 'date-fns-tz';

const RAFFLE = process.env.RAFFLE_ADDRESS;
const RPC = process.env.RPC_URL;
const PK = process.env.ADMIN_PRIVATE_KEY;
if (!RAFFLE || !RPC || !PK) throw new Error('Missing env (.env.admin)');

const RAFFLE_ABI = [
  { name:'roundId', inputs:[], outputs:[{type:'uint256'}], stateMutability:'view', type:'function' },
  { name:'openRound', inputs:[{type:'uint256'},{type:'bytes32'}], outputs:[], stateMutability:'nonpayable', type:'function' },
  { name:'rounds', inputs:[{type:'uint256'}],
    outputs:[{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'bytes32'},{type:'bytes32'},{type:'bool'},{type:'bool'}],
    stateMutability:'view', type:'function' },
];

function nycCloseAtUnix() {
  const tz = 'America/New_York';
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
  const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T22:00:00`;
  return Math.floor(zonedTimeToUtc(iso, tz).getTime()/1000);
}
function randomSecret32() {
  const b = new Uint8Array(32); crypto.getRandomValues(b); return toHex(b);
}

const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: base, transport: http(RPC) });

const closeAt = nycCloseAtUnix();
const now = Math.floor(Date.now()/1000);

const curId = await pub.readContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'roundId' });
let nextId = curId + 1n;

if (now > closeAt + 1800) { console.log('Too late for today; skipping'); process.exit(0); }

try {
  const r = await pub.readContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'rounds', args: [curId] });
  const rCloseAt = Number(r[2]); const rClosed = r[8];
  if (!rClosed && rCloseAt === closeAt) { console.log('Today already open.'); process.exit(0); }
} catch {}

const secret = randomSecret32();
const hash = keccak256(secret);

console.log('Opening round', nextId.toString(), 'closeAt', closeAt, 'hash', hash);
const tx = await wallet.writeContract({ address: RAFFLE, abi: RAFFLE_ABI, functionName: 'openRound', args: [BigInt(closeAt), hash] });
console.log('tx', tx);

const path = './automation/secrets.json';
let db = {}; if (fs.existsSync(path)) db = JSON.parse(fs.readFileSync(path,'utf-8'));
db[nextId.toString()] = { secret, closeAt };
fs.writeFileSync(path, JSON.stringify(db, null, 2));
console.log('Saved secret for round', nextId.toString());
