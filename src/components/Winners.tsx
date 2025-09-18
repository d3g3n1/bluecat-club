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

// A logs-only client that ALWAYS uses your RPC_URL (Alchemy)
const logsClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

function short(a: string) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

  async function load() {
    setLoading(true);
    try {
      const deployEnv = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      const deployBlock = /^\d+$/.test(deployEnv) ? BigInt(deployEnv) : 0n;

      const maxBackEnv = (import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000';
      const maxBack = /^\d+$/.test(maxBackEnv) ? BigInt(maxBackEnv) : 10000n;

      // Optional: force-catch the first finalize block you know about
      const hintEnv = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
      const hintBlock = /^\d+$/.test(hintEnv) ? BigInt(hintEnv) : undefined;

      const latest = await logsClient.getBlockNumber();
      const tailStart = latest > maxBack ? latest - maxBack : 0n;
      let from = deployBlock > tailStart ? deployBlock : tailStart;

      // Alchemy Free requires 10-block windows (inclusive)
      const WINDOW_DIFF = 9n;     // to - from <= 9
      const STEP = WINDOW_DIFF + 1n;

      console.log('[Winners] addr=', RAFFLE_ADDRESS);
      console.log('[Winners] latest=', Number(latest), 'from=', Number(from), 'hint=', hintBlock ? Number(hintBlock) : '(none)');

      if (!RAFFLE_ADDRESS || RAFFLE_ADDRESS.toLowerCase() === ZERO) {
        console.warn('[Winners] RAFFLE_ADDRESS missing/zero — cannot scan.');
        setTotalPaid(0n);
        setLeaders([]);
        return;
      }

      const logsAll: any[] = [];

      // 0) Targeted tiny pass if a hint block is provided
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
          if (targeted.length) {
            console.log('[Winners] targeted found:', targeted.length, 'in', Number(hFrom), '→', Number(hTo));
            logsAll.push(...targeted);
          }
        } catch (e) {
          // ignore; sweep below will pick it up
        }
      }

      // 1) Windowed sweep (bounded so it always finishes quickly)
      const MAX_WINDOWS = 2000; // 2000 * 10 = 20k blocks max
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
          if (part.length) {
            console.log('[Winners] window hit:', part.length, 'in', Number(from), '→', Number(to));
            logsAll.push(...part);
          }
        } catch (e: any) {
          console.warn('[Winners] window error, skipping', { from: Number(from), to: Number(to) }, e?.message || e);
        }

        from = to + 1n;
        // small delay helps avoid rate-limits
        await new Promise(r => setTimeout(r, 50));
      }

      console.log('[Winners] total logs found:', logsAll.length);

      // 2) Aggregate payouts
      let paid = 0n;
      const map = new Map<string, bigint>();

      for (const lg of logsAll) {
        const prize = lg.args?.prizePool as bigint;
        const winners = lg.args?.winners as `0x${string}`[] | undefined;
        if (!prize || !winners) continue;

        paid += prize;

        for (let i = 0; i < Math.min(5, winners.length); i++) {
          const addr = winners[i];
          if (!addr || addr.toLowerCase() === ZERO) continue;
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
