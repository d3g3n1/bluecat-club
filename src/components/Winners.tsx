// src/components/Winners.tsx
import React from 'react';
import { publicClient } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };

function short(a: string) {
  return a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
}

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

  async function load() {
    setLoading(true);
    try {
      // Where to start scanning:
      // - Prefer the contract's deploy block from env
      // - Otherwise, scan the recent tail (defaults to 10k blocks)
      const deployEnv = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      const deployBlock = BigInt(deployEnv || '0');
      const maxBackEnv = (import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000';
      const maxBack = BigInt(maxBackEnv);

      const latest = await publicClient.getBlockNumber();
      const tailStart = latest > maxBack ? latest - maxBack : 0n;
      let from = deployBlock > tailStart ? deployBlock : tailStart;

      // Alchemy Free: "≤ 10-block range" inclusive.
      // That means: to - from <= 9 (so count = 10).
      const WINDOW_DIFF = 9n;   // inclusive diff → 10 blocks per request
      const STEP = WINDOW_DIFF + 1n;

      // Safety valve so we never loop forever
      const MAX_WINDOWS = 2000; // 2000 * 10 = 20,000 blocks max per load
      let windows = 0;

      const logsAll: any[] = [];

      while (from <= latest && windows < MAX_WINDOWS) {
        windows++;
        const to = (from + WINDOW_DIFF > latest) ? latest : (from + WINDOW_DIFF);

        try {
          const part = await publicClient.getLogs({
            address: RAFFLE_ADDRESS,
            abi: RAFFLE_ABI as any,
            eventName: 'RoundFinalized',
            fromBlock: from,
            toBlock: to,
          });
          if (part.length) logsAll.push(...part);
        } catch (e: any) {
          // Network hiccup / rate-limit / provider limitation — skip this window.
          console.warn('[Winners] window error, skipping', { from: Number(from), to: Number(to) }, e?.message || e);
        }

        from = to + 1n;
        // Tiny backoff to play nice with public RPCs
        await new Promise(r => setTimeout(r, 60));
      }

      // Aggregate winners and totals
      let paid = 0n;
      const map = new Map<string, bigint>();
      const shares = [45n, 25n, 15n, 10n, 5n] as const;

      for (const lg of logsAll) {
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

      const top3 = Array.from(map.entries())
        .map(([address, total]) => ({ address: address as `0x${string}`, total }))
        .sort((a, b) => (a.total > b.total ? -1 : 1))
        .slice(0, 3);

      setTotalPaid(paid);
      setLeaders(top3);
    } catch (e) {
      console.error('[Winners] load error', e);
      // Show empty state instead of spinner forever
      setTotalPaid(0n);
      setLeaders([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, []);

  return (
    <div id="winners" className="card neon-border" style={{ padding: 18 }}>
      <div className="title-xl" style={{ fontSize: 24, marginBottom: 8 }}>
        Winners
      </div>

      {/* Total paid out so far */}
      <div className="muted" style={{ marginBottom: 6 }}>Total paid out so far</div>
      {loading ? (
        <div className="skeleton" style={{ width: 260, height: 40 }} />
      ) : (
        <div className="big-amount">{formatToken(totalPaid)} TOSHI</div>
      )}

      {/* Top 3 all-time */}
      <div style={{ height: 12 }} />
      <div className="title-xl" style={{ fontSize: 18, marginBottom: 8 }}>Top 3 All-Time</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {loading ? (
          <>
            <div className="skeleton" style={{ width: '100%', height: 40 }} />
            <div className="skeleton" style={{ width: '100%', height: 40 }} />
            <div className="skeleton" style={{ width: '100%', height: 40 }} />
          </>
        ) : leaders.length === 0 ? (
          <div className="muted">No winners yet—check back after the first finalize.</div>
        ) : (
          leaders.map((l, i) => (
            <div key={l.address} className="row" style={{
              justifyContent: 'space-between', alignItems: 'center',
              border: '1px solid rgba(43,208,255,.12)', borderRadius: 12, padding: '10px 12px'
            }}>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span className="chip" aria-hidden>#{i + 1}</span>
                <span style={{ fontWeight: 600 }}>{short(l.address)}</span>
              </div>
              <div style={{ fontWeight: 700 }}>{formatToken(l.total)} TOSHI</div>
            </div>
          ))
        )}
      </div>

      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Based on on-chain <code>RoundFinalized</code> events since deploy. Uses 10-block windows to respect free RPC limits.
      </div>
    </div>
  );
}
