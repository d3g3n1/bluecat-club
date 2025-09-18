// src/components/Winners.tsx
import React from 'react';
import { publicClient } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };
const shares = [45n, 25n, 15n, 10n, 5n] as const;

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
      const latest = await publicClient.getBlockNumber();

      // Env knobs
      const MAX_BACK = BigInt(
        (import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '3000'
      );
      const DEPLOY_BLOCK = BigInt(
        (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0'
      );
      const HINT = (() => {
        const v = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
        try { return v ? BigInt(v) : undefined; } catch { return undefined; }
      })();

      // Where to start scanning
      const backStart = latest > MAX_BACK ? latest - MAX_BACK : 0n;
      const fromInit =
        DEPLOY_BLOCK && DEPLOY_BLOCK < latest ? DEPLOY_BLOCK : backStart;

      console.log('[Winners] addr=', RAFFLE_ADDRESS);
      console.log('[Winners] latest=', Number(latest), 'from=', Number(fromInit), 'hint=', HINT && Number(HINT));

      const WINDOW = 10n; // Alchemy Free requires <= 10 block range per eth_getLogs
      const MAX_WINDOWS = 600; // 600 * 10 = 6k blocks hard cap per page load

      // Helper to fetch a single 10-block window
      async function fetchWindow(from: bigint, to: bigint) {
        if (to < from) return [];
        const logs = await publicClient.getLogs({
          address: RAFFLE_ADDRESS,
          abi: RAFFLE_ABI as any,
          eventName: 'RoundFinalized',
          fromBlock: from,
          toBlock: to,
        });
        if (logs.length) {
          console.log(
            `[Winners] window hit: ${logs.length} in ${Number(from)} → ${Number(to)}`
          );
        }
        return logs;
      }

      // 1) Optional targeted window around a known finalize block to guarantee we show *something* fast.
      const allLogs: any[] = [];
      const seen = new Set<string>(); // for de-duplication

      if (HINT && HINT >= fromInit && HINT <= latest) {
        const tFrom = HINT > 5n ? HINT - 5n : 0n;
        const tTo = HINT + 5n;
        const logs = await fetchWindow(tFrom, tTo);
        if (logs.length) console.log('[Winners] targeted found:', logs.length, 'in', Number(tFrom), '→', Number(tTo));
        for (const lg of logs) {
          const k = `${lg.transactionHash}:${lg.logIndex}`;
          if (!seen.has(k)) { seen.add(k); allLogs.push(lg); }
        }
      }

      // 2) Rolling windows back→forward
      let windowsUsed = 0;
      let from = fromInit;
      while (from <= latest && windowsUsed < MAX_WINDOWS) {
        windowsUsed++;
        let to = from + WINDOW;
        if (to > latest) to = latest;

        try {
          const logs = await fetchWindow(from, to);
          for (const lg of logs) {
            const k = `${lg.transactionHash}:${lg.logIndex}`;
            if (!seen.has(k)) { seen.add(k); allLogs.push(lg); }
          }
        } catch (e: any) {
          // Skip transient errors & keep going
          console.warn('[Winners] window error, skipping', { from: Number(from), to: Number(to) }, e?.message || e);
        }

        from = to + 1n;
      }

      console.log('[Winners] total logs found:', allLogs.length);

      // 3) Aggregate payouts
      let paid = 0n;
      const map = new Map<string, bigint>();

      for (const lg of allLogs) {
        const args: any = lg.args ?? {};
        // Robust field extraction (named or positional)
        const prize: bigint | undefined =
          (args.prizePool as bigint) ?? (args[2] as bigint);
        const winners: `0x${string}`[] | undefined =
          (args.winners as `0x${string}`[]) ??
          (args[1] as `0x${string}`[]);

        if (!prize || !winners) {
          console.warn('[Winners] unable to decode event args:', lg);
          continue;
        }

        paid += prize;

        for (let i = 0; i < Math.min(5, winners.length); i++) {
          const addr = winners[i];
          if (!addr) continue; // just in case
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
