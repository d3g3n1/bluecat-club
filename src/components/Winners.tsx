// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http, decodeEventLog, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

/* ---------- types ---------- */
type LastWinnerLine = { address: `0x${string}`, total: bigint };

type LastFinalize = {
  blockNumber: number;
  tx: string;
  prize: string;                // bigint as string (safe for JSON)
  winners: `0x${string}`[];
};

type Cache = {
  lastProcessed: number;            // highest block fully scanned & counted
  processed: Record<string, true>;  // tx-hash set (dedupe per finalize)
  totalPaid: string;                // bigint as string
  lastFinalize?: LastFinalize;      // snapshot for “Last Round Winners”
  v: 1;
};

/* ---------- constants ---------- */
const SHARES = [45n, 25n, 15n, 10n, 5n] as const;
const ZERO = '0x0000000000000000000000000000000000000000';
const LS_KEY = `bluecat:winners:${RAFFLE_ADDRESS}:v1`; // isolate per contract

// Dedicated logs RPC (put your Alchemy URL in VITE_LOGS_RPC_URL)
const LOGS_URL =
  (import.meta.env.VITE_LOGS_RPC_URL as string) || 'https://mainnet.base.org';

const logsClient = createPublicClient({
  chain: base,
  transport: http(LOGS_URL),
});

// RoundFinalized(uint256 indexed roundId, address[5] winners, uint256 prizePool, uint256 fee, bytes32 seed)
const ROUND_FINALIZED = parseAbiItem(
  'event RoundFinalized(uint256 indexed roundId, address[5] winners, uint256 prizePool, uint256 fee, bytes32 seed)'
);

/* ---------- utils ---------- */
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const short = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error('no cache');
    const c = JSON.parse(raw) as Cache;
    if (c?.v !== 1) throw new Error('version');
    if (typeof c.lastProcessed !== 'number' || typeof c.totalPaid !== 'string') {
      throw new Error('shape');
    }
    c.processed ||= {};
    return c;
  } catch {
    return { lastProcessed: 0, processed: {}, totalPaid: '0', v: 1 };
  }
}

function saveCache(c: Cache) {
  // prevent unbounded growth of the tx-hash set
  const MAX = 2000;
  const keys = Object.keys(c.processed);
  if (keys.length > MAX) {
    // drop oldest arbitrarily (we don't keep order)
    for (let i = 0; i < keys.length - MAX; i++) delete c.processed[keys[i]];
  }
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

async function getWindowRawLogs(from: bigint, to: bigint, retries = 2) {
  try {
    // raw logs (no ABI) → decode locally so we control the 10-block window exactly
    return await logsClient.getLogs({
      address: RAFFLE_ADDRESS,
      fromBlock: from,
      toBlock: to,
    });
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (
      retries > 0 &&
      (msg.includes('429') ||
       msg.toLowerCase().includes('rate') ||
       msg.toLowerCase().includes('timeout') ||
       msg.includes('400'))
    ) {
      await sleep(1200);
      return getWindowRawLogs(from, to, retries - 1);
    }
    throw e;
  }
}

function tryDecode(lg: any) {
  try {
    const { args, eventName } = decodeEventLog({
      abi: [ROUND_FINALIZED],
      data: lg.data,
      topics: lg.topics,
    });
    if (eventName !== 'RoundFinalized') return undefined;

    // prefer named args; fallback to positional
    const a: any = args;
    const prize: bigint | undefined   = a?.prizePool ?? a?.[2];
    const winners: (`0x${string}` | undefined)[] | undefined = a?.winners ?? a?.[1];
    if (!prize || !winners) return undefined;

    return { prize, winners: winners as `0x${string}`[] };
  } catch {
    return undefined;
  }
}

/* ---------- component ---------- */
export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);          // cumulative (persisted)
  const [lastWinners, setLastWinners] = React.useState<LastWinnerLine[]>([]); // last round only

  // dev-only cache reset (no visible button)
  React.useEffect(() => {
    (window as any).__bluecatWinnersReset = () => {
      try { localStorage.removeItem(LS_KEY); } catch {}
      location.reload();
    };
    return () => { try { delete (window as any).__bluecatWinnersReset; } catch {} };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const latest = await logsClient.getBlockNumber();
      const maxBack    = BigInt((import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000');
      const deployFrom = BigInt((import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0');
      const hintEnv    = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
      const hintBlock  = hintEnv ? BigInt(hintEnv) : undefined;

      const cache = loadCache();

      // Start from after the last processed block if present,
      // otherwise backfill a bounded window: max(latest-maxBack, deployFrom)
      const initial = cache.lastProcessed > 0
        ? BigInt(cache.lastProcessed + 1)
        : (() => {
            const back = latest > maxBack ? latest - maxBack : 0n;
            return deployFrom > back ? deployFrom : back;
          })();

      // Alchemy Free: ≤10 blocks inclusive → WINDOW=9 so [cur, cur+9] spans 10 blocks
      const WINDOW = 9n;

      let mostRecent: LastFinalize | undefined = cache.lastFinalize;

      // ---- 1) Target a small band around a known finalize block (if provided) ----
      if (hintBlock) {
        const hFrom = hintBlock > 4n ? (hintBlock - 4n) : 0n; // inclusive 10: [h-4, h+5]
        const hTo   = hintBlock + 5n;

        const handleWindow = async (from: bigint, to: bigint) => {
          const raws = await getWindowRawLogs(from, to);
          for (const lg of raws) {
            const dec = tryDecode(lg);
            if (!dec) continue;
            const bn = Number(lg.blockNumber ?? 0);
            const tx = (lg as any).transactionHash as string;

            // snapshot last round
            if (bn >= (mostRecent?.blockNumber ?? 0)) {
              mostRecent = { blockNumber: bn, tx, prize: dec.prize.toString(), winners: dec.winners };
            }
            // add once per finalize tx
            if (!cache.processed[tx]) {
              cache.totalPaid = (BigInt(cache.totalPaid || '0') + dec.prize).toString();
              cache.processed[tx] = true;
            }
          }
        };

        try {
          await handleWindow(hFrom, hTo);
        } catch {
          // split fallback for picky providers (off-by-one)
          await Promise.allSettled([
            handleWindow(hFrom, hintBlock),
            handleWindow(hintBlock + 1n, hTo),
          ]);
        }
      }

      // ---- 2) Sweep forward from `initial` to `latest` in tiny windows ----
      let cur = initial;
      const MAX_WINDOWS = 1200; // safety cap (≈12k blocks when WINDOW=9)
      let used = 0;

      while (cur <= latest && used < MAX_WINDOWS) {
        const to = cur + WINDOW > latest ? latest : cur + WINDOW;

        try {
          const raws = await getWindowRawLogs(cur, to);
          for (const lg of raws) {
            const dec = tryDecode(lg);
            if (!dec) continue;
            const bn = Number(lg.blockNumber ?? 0);
            const tx = (lg as any).transactionHash as string;

            if (bn >= (mostRecent?.blockNumber ?? 0)) {
              mostRecent = { blockNumber: bn, tx, prize: dec.prize.toString(), winners: dec.winners };
            }
            if (!cache.processed[tx]) {
              cache.totalPaid = (BigInt(cache.totalPaid || '0') + dec.prize).toString();
              cache.processed[tx] = true;
            }
          }
        } catch (e: any) {
          // Skip this window on hiccup; keep going.
          // console.warn('[Winners] window error', { from: Number(cur), to: Number(to) }, e?.message || e);
        }

        cache.lastProcessed = Number(to);
        saveCache(cache);

        if (to === latest) break;
        await sleep(250);   // be kind to free tier
        cur = to + 1n;
        used++;
      }

      // Persist the latest snapshot (for instant display on next visit)
      if (mostRecent) {
        cache.lastFinalize = mostRecent;
        saveCache(cache);
      }

      // ---- Update UI ----
      setTotalPaid(BigInt(cache.totalPaid || '0'));

      const winnersForUi: LastWinnerLine[] = (() => {
        if (!mostRecent) return [];
        const prize = BigInt(mostRecent.prize);
        const addrs = mostRecent.winners || [];
        return addrs.slice(0, 5).map((addr, i) => ({
          address: addr,
          total: (prize * SHARES[i]) / 100n,
        })).filter(w => w.address && w.address !== ZERO);
      })();

      setLastWinners(winnersForUi);
    } catch (e) {
      console.error('[Winners] load error', e);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, []);

  return (
    <div id="winners" className="card neon-border" style={{ padding: 18 }}>
      <div className="title-xl" style={{ fontSize: 24, marginBottom: 8 }}>Winners</div>

      {/* Total paid out so far (cumulative from cached scans) */}
      <div className="muted" style={{ marginBottom: 6 }}>Total paid out so far</div>
      {loading ? (
        <div className="skeleton" style={{ width: 260, height: 40 }} />
      ) : (
        <div className="big-amount">{formatToken(totalPaid)} TOSHI</div>
      )}

      <div style={{ height: 12 }} />
      <div className="title-xl" style={{ fontSize: 18, marginBottom: 8 }}>Last Round Winners</div>

      <div style={{ display:'grid', gap:8 }}>
        {loading ? (
          <>
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
          </>
        ) : lastWinners.length === 0 ? (
          <div className="muted">No finalized round found yet in the scanned range.</div>
        ) : (
          lastWinners.map((l, i) => (
            <div key={`${l.address}-${i}`} className="row" style={{
              justifyContent:'space-between', alignItems:'center',
              border:'1px solid rgba(43,208,255,.12)', borderRadius:12, padding:'10px 12px'
            }}>
              <div className="row" style={{ gap:10, alignItems:'center' }}>
                <span className="chip" aria-hidden>#{i+1}</span>
                <span style={{ fontWeight:600 }}>{short(l.address)}</span>
              </div>
              <div style={{ fontWeight:700 }}>{formatToken(l.total)} TOSHI</div>
            </div>
          ))
        )}
      </div>

      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Cumulative total is computed from on-chain <code>RoundFinalized</code> events and cached locally.
        Uses ≤10-block windows with backoff to fit free RPC limits.
      </div>
    </div>
  );
}
