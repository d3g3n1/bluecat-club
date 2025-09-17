// automation/run-ops.mjs
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { zonedTimeToUtc } from 'date-fns-tz';

// ------- ENV from GitHub Secrets -------
const RPC_URL        = process.env.RPC_URL;
const RAFFLE_ADDRESS = process.env.RAFFLE_ADDRESS;
const ADMIN_KEY      = process.env.ADMIN_PRIVATE_KEY;
const MASTER_SECRET  = process.env.MASTER_SECRET;   // 0x + 64 hex

if (!RPC_URL || !RAFFLE_ADDRESS || !ADMIN_KEY || !MASTER_SECRET) {
  console.error('Missing one or more required secrets: RPC_URL, RAFFLE_ADDRESS, ADMIN_PRIVATE_KEY, MASTER_SECRET');
  process.exit(1);
}

// ------- Minimal ABI we need -------
const RAFFLE_ABI = [
  { type:'function', name:'currentRound', stateMutability:'view', inputs:[], outputs:[
    {type:'uint256', name:'id'},
    {type:'uint256', name:'openAt'},
    {type:'uint256', name:'closeAt'},
    {type:'uint256', name:'pot'},
    {type:'bool',    name:'closed'},
    {type:'bool',    name:'drawn'},
  ]},
  { type:'function', name:'roundId', stateMutability:'view', inputs:[], outputs:[{type:'uint256'}] },
  { type:'function', name:'openRound',     stateMutability:'nonpayable', inputs:[{type:'uint256'},{type:'bytes32'}], outputs:[] },
  { type:'function', name:'closeRound',    stateMutability:'nonpayable', inputs:[{type:'uint256'}],                outputs:[] },
  { type:'function', name:'finalizeRound', stateMutability:'nonpayable', inputs:[{type:'uint256'},{type:'bytes32'}], outputs:[] },
];

// ------- Clients -------
const account      = privateKeyToAccount(ADMIN_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

// ------- Helpers -------
const TZ = 'America/New_York';
const CLOSE_HOUR_ET = 22; // 10:00 PM ET

function nextCloseAtInET(nowUtcMs = Date.now()) {
  // Next 10:00 PM ET (today if still before 10pm ET, else tomorrow)
  const now = new Date(nowUtcMs);
  const local = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const y = local.getFullYear(); const m = local.getMonth(); const d = local.getDate();
  const targetLocal = new Date(y, m, d, CLOSE_HOUR_ET, 0, 0, 0);
  const targetMs = (local.getTime() > targetLocal.getTime())
    ? new Date(y, m, d + 1, CLOSE_HOUR_ET, 0, 0, 0)
    : targetLocal;
  const utcDate = zonedTimeToUtc(targetMs, TZ);
  return Math.floor(utcDate.getTime() / 1000);
}

// secret = keccak256(abi.encode(masterSecret, roundId))
function secretForRound(masterHex, roundId) {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }],
    [masterHex, roundId]
  ));
}
// commit = keccak256(abi.encode(secret))
function commitFromSecret(secretHex) {
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }], [secretHex]));
}

async function main() {
  console.log('⏱  Raffle ops start:', new Date().toISOString());

  let [id, openAt, closeAt, pot, closed, drawn] = await publicClient.readContract({
    address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'currentRound'
  });
  id = BigInt(id);

  // ---------- BOOTSTRAP: open Round #1 if none exists ----------
  if (id === 0n) {
    const nextId   = 1n;
    const secret   = secretForRound(MASTER_SECRET, nextId);
    const commit   = commitFromSecret(secret);
    const nextClose= nextCloseAtInET();

    console.log('➡️  bootstrap openRound', nextId.toString(), 'closeAt=', nextClose, 'commit=', commit);
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS,
      abi: RAFFLE_ABI,
      functionName: 'openRound',
      args: [BigInt(nextClose), commit],
    });
    console.log('   tx:', tx);
    console.log('✅  Bootstrap complete — next runs will handle close/finalize/open.');
    return;
  }
  // -------------------------------------------------------------

  const now = Math.floor(Date.now()/1000);
  console.log(`Round #${id} | closeAt=${closeAt} | closed=${closed} | drawn=${drawn}`);

  // A) Close if time passed and not yet closed
  if (!closed && now >= Number(closeAt)) {
    console.log('➡️  closeRound', id.toString());
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'closeRound', args:[id]
    });
    console.log('   tx:', tx);
  }

  // Refresh state after potential close
  ;([id, openAt, closeAt, pot, closed, drawn] = await publicClient.readContract({
    address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'currentRound'
  }));
  id = BigInt(id);

  // B) Finalize if closed and not drawn
  if (closed && !drawn) {
    const secret = secretForRound(MASTER_SECRET, id);
    console.log('➡️  finalizeRound', id.toString(), 'secret=', secret);
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'finalizeRound', args:[id, secret]
    });
    console.log('   tx:', tx);
  }

  // C) If drawn, open next round
  const isDrawnNow = (await publicClient.readContract({
    address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'currentRound'
  }))[5];

  if (isDrawnNow) {
    const nextId = (await publicClient.readContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'roundId'
    })) + 1n;

    const secretNext = secretForRound(MASTER_SECRET, nextId);
    const commit = commitFromSecret(secretNext);
    const nextClose = nextCloseAtInET();

    console.log('➡️  openRound', nextId.toString(), 'closeAt=', nextClose, 'commit=', commit);
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'openRound',
      args:[BigInt(nextClose), commit]
    });
    console.log('   tx:', tx);
  }

  console.log('✅  Done');
}

main().catch(e => { console.error(e); process.exit(1); });
