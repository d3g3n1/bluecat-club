// src/components/Winners.tsx
import React from 'react';
import { publicClient } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };
const shares = [45n, 25n, 15n, 10n, 5n];

function short(a: string) { return a ? a.slice(0,6) + '…' + a.slice(-4) : ''; }

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

  async function load() {
    setLoading(true);
    try {
      // How far back to look (can override via Netlify env: VITE_MAX_SCAN_BACK_BLOCKS)
      const MAX_BACK = BigInt((import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '3000');
      const latest   = await publicClient.getBlockNumber();
      const fromInit = latest > MAX_BACK ? latest - MAX_BACK : 0n;

      // Alchemy Free requires ≤10-block windows for eth_getLogs
      const WINDOW = 10n;
      let from = fromInit;
      let anyFound = false;
      const allLogs: any[] = [];

      // Hard cap the number of windows so we always finish quickly
      const MAX_WINDOWS = 400; // 400 × 10 = 4,000 blocks max
      let windowsUsed = 0;

      while (from <= latest && windowsUsed < MAX_WINDOWS) {
        windowsUsed++;
        let to = from + WINDOW;
        if (to > latest) to = latest;

        try {
          const logs = await publicClient.getLogs({
            address: RAFFLE_ADDRESS,
            abi: RAFFLE_ABI as any,
            eventName: 'RoundFinalized',
            fromBlock: from,
            toBlock: to
          });

          if (logs.length) {
            allLogs.push(...logs);
            anyFound = true;
            // Early exit: we already have winners to display.
            break;
          }
        } catch (e: any) {
          // If rate-limited or minor hiccup, just skip this window and keep going.
          console.warn('[Winners] window error, skipping', { from: Number(from), to: Number(to) }, e?.message || e);
        }

        from = to + 1n;
      }

      // Aggregate results
      let paid = 0n;
      const map = new Map<string, bigint>();

      for (const lg of allLogs) {
        const prize = lg.args?.prizePool as bigint;
        const winners = lg.args?.winners as `0x${string}`[] | undefined;
        if (!prize || !winners) continue;

        paid += prize;

        for (let i = 0; i < Math.min(5, winners.length); i++) {
          const addr = winners[i];
          if (!addr) continue;
          const amt = (prize * shares[i]) / 100n;
          map.set(addr, (map.get(addr) || 0n) + amt);
        }
      }

      const arr = Array.from(map.entries())
        .map(([address, total]) => ({ address: address as `0x${string}`, total }))
        .sort((a, b) => (a.total > b.total ? -1 : 1))
        .slice(0, 3);

      setTotalPaid(paid);
      setLeaders(arr);
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

      <div className="muted" style={{ marginBottom: 6 }}>Total paid out so far</div>
      {loading ? (
        <div className="skeleton" style={{ width: 260, height: 40 }} />
      ) : (
        <div className="big-amount">{formatToken(totalPaid)} TOSHI</div>
      )}

      <div style={{ height: 12 }} />
      <div className="title-xl" style={{ fontSize: 18, marginBottom: 8 }}>Top 3 All-Time</div>
      <div style={{ display:'grid', gap:8 }}>
        {loading ? (
          <>
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
            <div className="skeleton" style={{ width:'100%', height: 40 }} />
          </>
        ) : leaders.length === 0 ? (
          <div className="muted">No winners yet—check back after the first finalize.</div>
        ) : (
          leaders.map((l, i) => (
            <div key={l.address} className="row" style={{
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
        Based on recent on-chain <code>RoundFinalized</code> events (last 3k blocks by default).
      </div>
    </div>
  );
}
