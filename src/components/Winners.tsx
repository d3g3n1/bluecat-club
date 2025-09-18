// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS, RPC_URL } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };
const ZERO = '0x0000000000000000000000000000000000000000';
const shares = [45n, 25n, 15n, 10n, 5n] as const;

function short(a: string) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

// A dedicated client that ONLY uses your RPC_URL (so Alchemy rules apply consistently)
const logsClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

  async function load() {
    setLoading(true);
    try {
      // Env knobs:
      // - VITE_RAFFLE_DEPLOY_BLOCK: your contract deploy (or a nearby earlier block)
      // - VITE_MAX_SCAN_BACK_BLOCKS: how far back to scan (default 10k ≈ ~5.5 hours on Base ~2s/block)
      // - VITE_HINT_FINALIZE_BLOCK: optional exact block # you know contains a RoundFinalized
      const deployEnv = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      const deployBlock = /^\d+$/.test(deployEnv) ? BigInt(deployEnv) : 0n;

      const maxBackEnv = (import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000';
      const maxBack = /^\d+$/.test(maxBackEnv) ? BigInt(maxBackEnv) : 10000n;

      const hintEnv = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
      const hintBlock = /^\d+$/.test(hintEnv) ? BigInt(hintEnv) : undefined;

      const latest = await logsClient.getBlockNumber();

      // Start at max(deploy, latest - maxBack)
      const tailStart = latest > maxBack ? latest - maxBack : 0n;
      let from = deployBlock > tailStart ? deployBlock : tailStart;

      // Alchemy Free: 10-block *inclusive* window ⇒ to - from ≤ 9
      const WINDOW_DIFF = 9n;
      const STEP = WINDOW_DIFF + 1n;

      const logsAll: any[] = [];

      // 0) Optional "targeted" pass if you know the exact finalize block.
      if (hintBlock && hintBlock >= from && hintBlock <= latest) {
        const hFrom = hintBlock > 2n ? hintBlock - 2n : 0n;
        const hTo = hintBlock + 2n;
        try {
          const targeted = await logsClient.getLogs({
            address: RAFFLE_ADDRESS,
            abi: RAFFLE_ABI as any,
            eventName: 'RoundFinalized',
            fromBlock: hFrom,
            toBlock: hTo,
          });
          if (targeted.length) logsAll.push(...targeted);
        } catch (e) {
          // ignore; we'll sweep in windows next
        }
      }

      // 1) Windowed sweep (10-block windows). Keep it bounded so it always finishes fast.
      //    2000 windows ≈ 20k blocks. With your current 10k tail, it’s plenty.
      const MAX_WINDOWS = 2000;
      let windows = 0;

      while (from <= latest && windows < MAX_WINDOWS) {
        windows++;
        const to = (from + WINDOW_DIFF > latest) ? latest : (from + WINDOW_DIFF);

        try {
          const part = await logsClient.getLogs({
            address: RAFFLE_ADDRESS,
            abi: RAFFLE_ABI as any,
            eventName: 'RoundFinalized',
            fromBlock: from,
            toBlock: to,
          });
          if (part.length) logsAll.push(...part);
        } catch (e: any) {
          // If rate-limited / minor hiccup, skip this tiny window and move on.
          console.warn('[Winners] window error, skipping', { from: Number(from), to: Number(to) }, e?.message || e);
        }

        from = to + 1n;
        // tiny backoff helps with public RPCs; safe for UI
        await new Promise(r => setTimeout(r, 50));
      }

      console.debug('[Winners] Found finalize logs:', logsAll.length);

      // 2) Aggregate
      let paid = 0n;
      const map = new Map<string, bigint>();

      for (const lg of logsAll) {
        const prize = lg.args?.prizePool as bigint;
        const winners = lg.args?.winners as `0x${string}`[] | undefined;
        if (!prize || !winners) continue;

        paid += prize;

        for (let i = 0; i < Math.min(5, winners.length); i++) {
          const addr = winners[i];
          if (!addr || addr.toLowerCase() === ZERO) continue; // ignore empty slots
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
      setTotalPaid(0n);
      setLeaders([]);
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
        Based on <code>RoundFinalized</code> events. Scans in 10-block windows (Alchemy Free-tier compatible).
      </div>
    </div>
  );
}
