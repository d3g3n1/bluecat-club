// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http, decodeEventLog, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type LastWinnerLine = { address: `0x${string}`, total: bigint };
type Row = { prize: bigint; winners: `0x${string}`[]; bn: number };

const SHARES = [45n, 25n, 15n, 10n, 5n] as const;

// Dedicated logs RPC (Alchemy URL recommended via env)
const LOGS_URL = (import.meta.env.VITE_LOGS_RPC_URL as string) || 'https://mainnet.base.org';
const logsClient = createPublicClient({ chain: base, transport: http(LOGS_URL) });

// RoundFinalized(uint256 indexed roundId, address[5] winners, uint256 prizePool, uint256 fee, bytes32 seed)
const ROUND_FINALIZED = parseAbiItem(
  'event RoundFinalized(uint256 indexed roundId, address[5] winners, uint256 prizePool, uint256 fee, bytes32 seed)'
);

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const short = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const ZERO = '0x0000000000000000000000000000000000000000';

// raw logs (no ABI) → we decode locally to keep windows tiny (≤10 blocks inclusive)
async function getWindowRawLogs(from: bigint, to: bigint, retries = 2) {
  try {
    return await logsClient.getLogs({ address: RAFFLE_ADDRESS, fromBlock: from, toBlock: to });
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

function decodeFinalize(lg: any): Row | undefined {
  try {
    const { args, eventName } = decodeEventLog({
      abi: [ROUND_FINALIZED],
      data: lg.data,
      topics: lg.topics,
    });
    if (eventName !== 'RoundFinalized') return;
    const a: any = args;
    const prize: bigint | undefined = a?.prizePool ?? a?.[2];
    const winners: (`0x${string}` | undefined)[] | undefined = a?.winners ?? a?.[1];
    if (!prize || !winners) return;
    return { prize, winners: winners as `0x${string}`[], bn: Number(lg.blockNumber ?? 0) };
  } catch {
    return;
  }
}

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [lastPrize, setLastPrize] = React.useState<bigint>(0n);             // most recent prizePool
  const [lastWinners, setLastWinners] = React.useState<LastWinnerLine[]>([]); // most recent winners

  async function load() {
    setLoading(true);
    try {
      const latest = await logsClient.getBlockNumber();

      // Scan **backwards** from latest in ≤10-block windows until we find a finalize
      const WINDOW = 9n;                // 9 so [from,to] spans 10 blocks inclusive
      const MAX_WINDOWS = 1200;         // ~12k blocks safety bound

      let to = latest;
      let found: Row | null = null;
      let scans = 0;

      while (!found && scans < MAX_WINDOWS) {
        const from = to > WINDOW ? to - WINDOW : 0n;
        let raws: any[] = [];
        try {
          raws = await getWindowRawLogs(from, to);
        } catch {
          // skip this window on hiccup
        }

        for (const lg of raws) {
          const row = decodeFinalize(lg);
          if (!row) continue;
          if (!found || row.bn > found.bn) found = row; // keep most recent in this window
        }

        if (found || from === 0n) break;
        to = from - 1n;     // step the window backwards
        scans++;
        await sleep(250);   // gentle backoff for free tier
      }

      if (!found) {
        // nothing yet
        setLastPrize(0n);
        setLastWinners([]);
        return;
      }

      // Build UI for the most recent round
      setLastPrize(found.prize);

      const lines: LastWinnerLine[] = [];
      for (let i = 0; i < 5; i++) {
        const addr = found.winners[i];
        if (!addr || addr === ZERO) continue;
        const amt = (found.prize * SHARES[i]) / 100n;
        lines.push({ address: addr, total: amt });
      }
      setLastWinners(lines);
    } catch (e) {
      console.error('[Winners] load error', e);
      setLastPrize(0n);
      setLastWinners([]);
    } finally {
      setLoading(false);
    }
  }

  // Initial load + refresh when tab comes back into focus
  React.useEffect(() => {
    load();
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div id="winners" className="card neon-border" style={{ padding: 18 }}>
      <div className="title-xl" style={{ fontSize: 24, marginBottom: 8 }}>Winners</div>

      {/* Label + big total for the most recent round */}
      <div className="muted" style={{ marginTop: 2, marginBottom: 4 }}>Total</div>
      {loading ? (
        <div className="skeleton" style={{ width: 260, height: 40, marginBottom: 12 }} />
      ) : (
        <div className="big-amount" style={{ marginBottom: 12 }}>{formatToken(lastPrize)} TOSHI</div>
      )}

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
          <div className="muted">No finalized round found yet.</div>
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
    </div>
  );
}
