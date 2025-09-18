// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };
type LastFinalize = {
  blockNumber: number;
  tx: string;
  prize: string; // bigint as string
  winners: `0x${string}`[];
};
type Cache = {
  lastProcessed: number;                // highest block we've scanned & counted
  processed: Record<string, true>;      // tx-hash set to de-dupe
  totalPaid: string;                     // bigint as string
  lastFinalize?: LastFinalize;
  v: 1;                                  // version for future migrations
};

const SHARES = [45n, 25n, 15n, 10n, 5n] as const;
const LS_KEY = 'bluecat:winners:v1';

// Logs client (dedicated URL so we can point it at Alchemy)
const LOGS_URL =
  (import.meta.env.VITE_LOGS_RPC_URL as string) || 'https://mainnet.base.org';

const logsClient = createPublicClient({ chain: base, transport: http(LOGS_URL) });

function short(a: string) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error('no cache');
    const parsed = JSON.parse(raw) as Cache;
    if (parsed?.v !== 1) throw new Error('bad version');
    // basic sanity
    if (typeof parsed.lastProcessed !== 'number' || typeof parsed.totalPaid !== 'string')
      throw new Error('bad shape');
    parsed.processed ||= {};
    return parsed;
  } catch {
    return {
      lastProcessed: 0,
      processed: {},
      totalPaid: '0',
      v: 1,
    };
  }
}

function saveCache(c: Cache) {
  // keep processed set from growing forever (cap ~2k hashes)
  const MAX_HASHES = 2000;
  const keys = Object.keys(c.processed);
  if (keys.length > MAX_HASHES) {
    // Drop oldest arbitrarily (we don't keep order; this is just a safety)
    for (let i = 0; i < keys.length - MAX_HASHES; i++) delete c.processed[keys[i]];
  }
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

async function getWindowLogs(from: bigint, to: bigint, retries = 2) {
  try {
    return await logsClient.getLogs({
      address: RAFFLE_ADDRESS,
      abi: RAFFLE_ABI as any,
      eventName: 'RoundFinalized',
      fromBlock: from,
      toBlock: to,
    });
  } catch (e: any) {
    const msg = String(e?.message || '');
    // free-tier friendliness
    if (
      retries > 0 &&
      (msg.includes('429') ||
       msg.toLowerCase().includes('rate') ||
       msg.toLowerCase().includes('timeout') ||
       msg.includes('400'))
    ) {
      await sleep(1200);
      return getWindowLogs(from, to, retries - 1);
    }
    throw e;
  }
}

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [lastWinners, setLastWinners] = React.useState<Leader[]>([]);

  async function load() {
    setLoading(true);
    try {
      const latest = await logsClient.getBlockNumber();
      const deployBlockEnv = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      const deployBlock = BigInt(deployBlockEnv || '0');

      // --- load cache & determine where to start ---
      const cache = loadCache();
      const startBlock = (cache.lastProcessed > 0)
        ? BigInt(cache.lastProcessed + 1)                         // continue forward
        : (deployBlock > 0n ? deployBlock : (latest > 10000n ? latest - 10000n : 0n)); // initial backfill

      // --- scan forward in ≤10-block windows (use 9 so [from, from+9] spans 10 blocks inclusive) ---
      const WINDOW = 9n;

      console.log('[BlueCat] RPC_URL in bundle:', LOGS_URL);
      console.log('[Winners] addr=', RAFFLE_ADDRESS);
      console.log('[Winners] latest=', Number(latest), 'from=', Number(startBlock));

      let cur = startBlock;
      let mostRecent: LastFinalize | undefined = cache.lastFinalize;

      while (cur <= latest) {
        const to = cur + WINDOW > latest ? latest : cur + WINDOW;

        let logs: any[] = [];
        try {
          logs = await getWindowLogs(cur, to);
        } catch (e: any) {
          console.warn('[Winners] window error, skipping', { from: Number(cur), to: Number(to) }, e?.message || e);
        }

        if (logs.length) {
          // Count new finalizes into the cumulative total; track latest finalize
          for (const lg of logs) {
            const tx = (lg as any).transactionHash as string;
            const bn = Number((lg as any).blockNumber ?? 0);
            const prize = lg.args?.prizePool as bigint | undefined;
            const winners = lg.args?.winners as `0x${string}`[] | undefined;

            // Update "most recent"
            if (bn >= (mostRecent?.blockNumber ?? 0) && prize && winners) {
              mostRecent = {
                blockNumber: bn,
                tx,
                prize: prize.toString(),
                winners,
              };
            }

            // Only add to total once per finalize tx
            if (prize && !cache.processed[tx]) {
              const curTotal = BigInt(cache.totalPaid || '0');
              cache.totalPaid = (curTotal + prize).toString();
              cache.processed[tx] = true;
            }
          }
        }

        cache.lastProcessed = Number(to);
        saveCache(cache);

        // throttle to be kind to free tier
        await sleep(250);
        if (to === latest) break;
        cur = to + 1n;
      }

      // If we still don't have a "most recent" (first-ever visit), try a tiny tail sweep near latest
      if (!mostRecent) {
        const tailFrom = latest > 2000n ? latest - 2000n : 0n;
        let tcur = tailFrom;
        while (tcur <= latest) {
          const to = tcur + WINDOW > latest ? latest : tcur + WINDOW;
          const logs = await getWindowLogs(tcur, to);
          for (const lg of logs) {
            const bn = Number((lg as any).blockNumber ?? 0);
            const tx = (lg as any).transactionHash as string;
            const prize = lg.args?.prizePool as bigint | undefined;
            const winners = lg.args?.winners as `0x${string}`[] | undefined;
            if (bn >= (mostRecent?.blockNumber ?? 0) && prize && winners) {
              mostRecent = { blockNumber: bn, tx, prize: prize.toString(), winners };
            }
          }
          await sleep(200);
          if (to === latest) break;
          tcur = to + 1n;
        }
      }

      // Persist the "most recent" for instant display next time
      if (mostRecent) {
        cache.lastFinalize = mostRecent;
        saveCache(cache);
      }

      // ---- expose state to UI ----
      setTotalPaid(BigInt(cache.totalPaid || '0'));

      const winnersForUi: Leader[] = (() => {
        if (!mostRecent) return [];
        const prize = BigInt(mostRecent.prize);
        const addrs = mostRecent.winners || [];
        return addrs.slice(0, 5).map((addr, i) => ({
          address: addr,
          total: (prize * SHARES[i]) / 100n,
        }));
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

      {/* Total paid out so far (cumulative, persisted) */}
      <div className="muted" style={{ marginBottom: 6 }}>Total paid out so far</div>
      {loading ? (
        <div className="skeleton" style={{ width: 260, height: 40 }} />
      ) : (
        <div className="big-amount">{formatToken(totalPaid)} TOSHI</div>
      )}

      <div style={{ height: 12 }} />
      <div className="title-xl" style={{ fontSize: 18, marginBottom: 8 }}>Last Round Winners (all 5)</div>

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
          <div className="muted">No finalized round yet—check back soon.</div>
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
