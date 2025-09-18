// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http, decodeEventLog, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type LastWinnerLine = { address: `0x${string}`, total: bigint };
type LastFinalize = {
  blockNumber: number;
  tx: string;
  prize: string;                // bigint as string
  winners: `0x${string}`[];
};
type Cache = {
  lastProcessed: number;        // highest block we have scanned & counted
  processed: Record<string, true>; // tx-hash set to de-dupe prize additions
  totalPaid: string;            // bigint as string
  lastFinalize?: LastFinalize;
  v: 1;
};

const SHARES = [45n, 25n, 15n, 10n, 5n] as const;
const ZERO = '0x0000000000000000000000000000000000000000';
const LS_KEY = 'bluecat:winners:v1';

// Dedicated logs RPC (Alchemy URL recommended via env)
const LOGS_URL = (import.meta.env.VITE_LOGS_RPC_URL as string) || 'https://mainnet.base.org';

const logsClient = createPublicClient({
  chain: base,
  transport: http(LOGS_URL),
});

// RoundFinalized(uint256 indexed roundId, address[5] winners, uint256 prizePool, uint256 fee, bytes32 seed)
const ROUND_FINALIZED = parseAbiItem(
  'event RoundFinalized(uint256 indexed roundId, address[5] winners, uint256 prizePool, uint256 fee, bytes32 seed)'
);

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const short = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error('no cache');
    const c = JSON.parse(raw) as Cache;
    if (c?.v !== 1) throw new Error('version');
    if (typeof c.lastProcessed !== 'number' || typeof c.totalPaid !== 'string') throw new Error('shape');
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
    for (let i = 0; i < keys.length - MAX; i++) delete c.processed[keys[i]];
  }
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

async function getWindowRawLogs(from: bigint, to: bigint, retries = 2) {
  try {
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

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);     // cumulative (persisted)
  const [lastWinners, setLastWinners] = React.useState<LastWinnerLine[]>([]); // last round only

  async function load() {
    setLoading(true);
    try {
      const latest = await logsClient.getBlockNumber();
      const maxBack    = BigInt((import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000');
      const deployFrom = BigInt((import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0');
      const hintEnv    = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
      const hintBlock  = hintEnv ? BigInt(hintEnv) : undefined;

      // pull persisted totals & where we left off
      const cache = loadCache();

      // start from after the last processed block if present,
      // otherwise backfill a window bounded by deployFrom / maxBack
      const initial = cache.lastProcessed > 0
        ? BigInt(cache.lastProcessed + 1)
        : (() => {
            const back = latest > maxBack ? latest - maxBack : 0n;
            return deployFrom > back ? deployFrom : back;
          })();

      // Alchemy free tier: ≤10 blocks inclusive → use 9 so [cur, cur+9] spans 10
      const WINDOW = 9n;

      console.log('[BlueCat] RPC_URL in bundle:', LOGS_URL);
      console.log('[Winners] addr=', RAFFLE_ADDRESS);
      console.log('[Winners] latest=', Number(latest), 'from=', Number(initial), 'hint=', hintBlock ? Number(hintBlock) : 'none');

      let mostRecent: LastFinalize | undefined = cache.lastFinalize;

      // ---- Targeted pass around a known finalize block (if provided) ----
      if (hintBlock) {
        const hFrom = hintBlock > 4n ? hintBlock - 4n : 0n; // 10 inclusive: [h-4, h+5]
        const hTo   = hintBlock + 5n;
        try {
          const raws = await getWindowRawLogs(hFrom, hTo);
          for (const lg of raws) {
            const dec = tryDecode(lg);
            if (!dec) continue;
            const bn = Number(lg.blockNumber ?? 0);
            const tx = (lg as any).transactionHash as string;

            // update lastFinalize snapshot
            if (bn >= (mostRecent?.blockNumber ?? 0)) {
              mostRecent = { blockNumber: bn, tx, prize: dec.prize.toString(), winners: dec.winners };
            }

            // count prize once per tx into persistent total
            if (!cache.processed[tx]) {
              cache.totalPaid = (BigInt(cache.totalPaid || '0') + dec.prize).toString();
              cache.processed[tx] = true;
            }
          }
        } catch {
          // split on picky providers
          const parts = await Promise.allSettled([
            getWindowRawLogs(hFrom, hintBlock),
            getWindowRawLogs(hintBlock + 1n, hTo),
          ]);
          for (const part of parts) {
            if (part.status !== 'fulfilled') continue;
            for (const lg of part.value) {
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
          }
        }
      }

      // ---- Sweep forward from initial → latest in tiny windows ----
      let cur = initial;
      while (cur <= latest) {
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
          console.warn('[Winners] window error, skipping', { from: Number(cur), to: Number(to) }, e?.message || e);
        }

        cache.lastProcessed = Number(to);
        saveCache(cache);

        await sleep(250);
        if (to === latest) break;
        cur = to + 1n;
      }

      // persist snapshot for instant display next time
      if (mostRecent) {
        cache.lastFinalize = mostRecent;
        saveCache(cache);
      }

      // ---- Update UI state ----
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

  function resetCache() {
    try { localStorage.removeItem(LS_KEY); } catch {}
    setTotalPaid(0n);
    setLastWinners([]);
    // Re-scan from env bounds on next tick
    load();
  }

  React.useEffect(() => { load(); }, []);

  return (
    <div id="winners" className="card neon-border" style={{ padding: 18 }}>
      <div className="title-xl" style={{ fontSize: 24, marginBottom: 8 }}>Winners</div>

      {/* Total paid out so far (cumulative, persisted across visits) */}
      <div className="muted" style={{ marginBottom: 6 }}>
        Total paid out so far
        <button
          type="button"
          onClick={resetCache}
          style={{
            marginLeft: 10, padding: '2px 8px', fontSize: 11,
            border: '1px solid rgba(43,208,255,.25)', borderRadius: 8,
            background: 'transparent', color: 'inherit', cursor: 'pointer'
          }}
          title="Clear local winners cache & rescan"
        >
          Reset winners data
        </button>
      </div>
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
          <div className="muted">No finalized round found yet in the scanned window.</div>
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
        Cumulative total is computed from on-chain <code>RoundFinalized</code> events and cached locally.<br/>
        Uses ≤10-block windows with backoff to stay within free RPC limits.
      </div>
    </div>
  );
}
