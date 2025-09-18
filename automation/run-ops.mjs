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

// ====== ENV ======
const RPC_URL        = process.env.RPC_URL;
const RAFFLE_ADDRESS = process.env.RAFFLE_ADDRESS;
const ADMIN_KEY      = process.env.ADMIN_PRIVATE_KEY;
const MASTER_SECRET  = process.env.MASTER_SECRET;   // 0x + 64 hex

if (!RPC_URL || !RAFFLE_ADDRESS || !ADMIN_KEY || !MASTER_SECRET) {
  console.error('Missing one or more required secrets: RPC_URL, RAFFLE_ADDRESS, ADMIN_PRIVATE_KEY, MASTER_SECRET');
  process.exit(1);
}

// ====== ABIs ======
const RAFFLE_ABI = [
  // views
  { type:'function', name:'currentRound', stateMutability:'view', inputs:[], outputs:[
    {type:'uint256', name:'id'},
    {type:'uint256', name:'openAt'},
    {type:'uint256', name:'closeAt'},
    {type:'uint256', name:'pot'},
    {type:'bool',    name:'closed'},
    {type:'bool',    name:'drawn'},
  ]},
  { type:'function', name:'roundId', stateMutability:'view', inputs:[], outputs:[{type:'uint256'}] },
  { type:'function', name:'rounds', stateMutability:'view', inputs:[{type:'uint256'}], outputs:[
    {type:'uint256'}, // id
    {type:'uint256'}, // openAt
    {type:'uint256'}, // closeAt
    {type:'uint256'}, // pot
    {type:'uint256'}, // fee
    {type:'uint256'}, // prizePool
    {type:'bytes32'}, // serverSeedHash (commit)
    {type:'bytes32'}, // randomSeed
    {type:'bool'},    // closed
    {type:'bool'},    // drawn
  ]},
  { type:'function', name:'owner',    stateMutability:'view', inputs:[], outputs:[{type:'address'}] },
  { type:'function', name:'operator', stateMutability:'view', inputs:[], outputs:[{type:'address'}] },
  { type:'function', name:'toshi',    stateMutability:'view', inputs:[], outputs:[{type:'address'}] },

  // writes
  { type:'function', name:'openRound',     stateMutability:'nonpayable', inputs:[{type:'uint256'},{type:'bytes32'}], outputs:[] },
  { type:'function', name:'closeRound',    stateMutability:'nonpayable', inputs:[{type:'uint256'}],                outputs:[] },
  { type:'function', name:'finalizeRound', stateMutability:'nonpayable', inputs:[{type:'uint256'},{type:'bytes32'}], outputs:[] },
];

const ERC20_ABI = [
  { type:'function', name:'balanceOf', stateMutability:'view', inputs:[{type:'address'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'decimals',  stateMutability:'view', inputs:[], outputs:[{type:'uint8'}] },
];

// ====== Clients ======
const account      = privateKeyToAccount(ADMIN_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

// ====== Helpers ======
const TZ = 'America/New_York';
const CLOSE_HOUR_ET = 22; // 10:00 PM ET

function nextCloseAtInET(nowUtcMs = Date.now()) {
  const now = new Date(nowUtcMs);
  const local = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const y = local.getFullYear(), m = local.getMonth(), d = local.getDate();
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

async function readRoundTuple(id) {
  const r = await publicClient.readContract({
    address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'rounds', args:[id]
  });
  return {
    id:        BigInt(r[0]),
    openAt:    Number(r[1]),
    closeAt:   Number(r[2]),
    pot:       BigInt(r[3]),
    fee:       BigInt(r[4]),
    prizePool: BigInt(r[5]),
    commit:    r[6],
    random:    r[7],
    closed:    Boolean(r[8]),
    drawn:     Boolean(r[9]),
  };
}

function fmt(n, dec = 18) {
  // best-effort human formatting without bignumber libs
  const s = n.toString().padStart(dec + 1, '0');
  const head = s.slice(0, -dec) || '0';
  const tail = s.slice(-dec).replace(/0+$/, '');
  return tail ? `${head}.${tail}` : head;
}

async function main() {
  console.log('⏱  Raffle ops start:', new Date().toISOString());
  console.log('Worker address:', account.address);

  // Who controls the contract?
  const [owner, operator] = await Promise.all([
    publicClient.readContract({ address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'owner' }),
    publicClient.readContract({ address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'operator' }),
  ]);
  console.log('Owner   :', owner);
  console.log('Operator:', operator);

  // Current round header
  let [id, openAt, closeAt, pot, closed, drawn] = await publicClient.readContract({
    address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'currentRound'
  });
  id = BigInt(id);
  console.log(`currentRound => id=${id} closeAt=${closeAt} closed=${closed} drawn=${drawn}`);

  // ===== Bootstrap: open round #1 if id == 0 =====
  if (id === 0n) {
    const nextId = 1n;
    const secret   = secretForRound(MASTER_SECRET, nextId);
    const commit   = commitFromSecret(secret);
    const nextClose= nextCloseAtInET();
    console.log('➡️  bootstrap openRound', nextId.toString(), 'closeAt=', nextClose, 'commit=', commit);
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'openRound',
      args: [BigInt(nextClose), commit],
    });
    console.log('   tx:', tx);
    console.log('✅  Bootstrap complete — next runs will handle close/finalize/open.');
    return;
  }

  // Full round details
  let R = await readRoundTuple(id);
  console.log('Round tuple:', {
    id: R.id.toString(), closeAt: R.closeAt, pot: R.pot.toString(),
    fee: R.fee.toString(), prizePool: R.prizePool.toString(),
    closed: R.closed, drawn: R.drawn, commit: R.commit
  });

  // Token & balance vs pot
  const toshiAddr = await publicClient.readContract({
    address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'toshi'
  });
  let [tokBal, tokDec] = await Promise.all([
    publicClient.readContract({ address: toshiAddr, abi: ERC20_ABI, functionName: 'balanceOf', args:[RAFFLE_ADDRESS] }),
    publicClient.readContract({ address: toshiAddr, abi: ERC20_ABI, functionName: 'decimals' }),
  ]);
  tokBal = BigInt(tokBal); tokDec = Number(tokDec);
  console.log(`TOSHI token: ${toshiAddr}`);
  console.log(`Contract TOSHI balance: ${tokBal.toString()} (${fmt(tokBal, tokDec)})`);
  console.log(`Round pot: ${R.pot.toString()} (${fmt(R.pot, tokDec)})`);

  const now = Math.floor(Date.now()/1000);

  // A) Close if time passed and not yet closed
  if (!R.closed && now >= R.closeAt) {
    console.log('➡️  closeRound', R.id.toString());
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'closeRound', args:[R.id]
    });
    console.log('   tx:', tx);
    R = await readRoundTuple(id);
    console.log('After close:', { fee: R.fee.toString(), prizePool: R.prizePool.toString(), closed: R.closed });
  }

  // B) Finalize if closed and not drawn
  if (R.closed && !R.drawn) {
    const secret = secretForRound(MASTER_SECRET, R.id);
    const calcCommit = commitFromSecret(secret);
    console.log('Stored commit:', R.commit);
    console.log('Calc   commit:', calcCommit);

    if (R.commit.toLowerCase() !== calcCommit.toLowerCase()) {
      console.error('❌ Secret mismatch. Your current MASTER_SECRET does not match the commit stored on-chain for this round.');
      console.error('   Action will skip finalize to avoid a reverting tx. Update MASTER_SECRET to the original value for this round.');
      process.exit(1);
    }

    // Small sanity check: token balance should cover prize pool + fee
    const need = R.prizePool + R.fee;
    if (tokBal < need) {
      console.error('❌ Contract token balance is less than required payouts (prizePool + fee).');
      console.error(`   balance=${tokBal.toString()} need=${need.toString()}`);
      process.exit(1);
    }

    console.log('➡️  finalizeRound', R.id.toString(), 'secret=', secret);
    const tx = await walletClient.writeContract({
      address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'finalizeRound', args:[R.id, secret]
    });
    console.log('   tx:', tx);
    R = await readRoundTuple(id);
    console.log('After finalize:', { drawn: R.drawn, randomSeed: R.random });
  }

  // C) If drawn, open next round
  if (R.drawn) {
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
