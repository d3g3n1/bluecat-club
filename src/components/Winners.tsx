// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };
const shares = [45n, 25n, 15n, 10n, 5n];

// Dedicated logs RPC (use your Alchemy URL if set)
const LOGS_URL =
  (import.meta.env.VITE_LOGS_RPC_URL as string) || 'https://mainnet.base.org';

const logsClient = createPublicClient({
  chain: base,
  transport: http(LOGS_URL),
});

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const short = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

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

  async function load() {
    setLoading(true);
    try {
      const latest = await logsClient.getBlockNumber();
      const maxBack = BigInt((import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000');
      const deployBlockEnv = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      const deployBlock = BigInt(deployBlockEnv || '0');
      const hintBlockEnv = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
      const hintBlock = hintBlockEnv ? BigInt(hintBlockEnv) : undefined;

      let from = latest > maxBack ? (latest - maxBack) : 0n;
      if (deployBlock > from) from = deployBlock;

      // ≤10 blocks inclusive → use +9 (cur..cur+9)
      const WINDOW = 9n;

      console.log('[BlueCat] RPC_URL in bundle:', LOGS_URL);
      console.log('[Winners] addr=', RAFFLE_ADDRESS);
      console.log('[Winners] latest=', Number(latest), 'from=', Number(from), 'hint=', hintBlock ? Number(hintBlock) : 'none');

      const allLogs: any[] = [];
      const seen = new Set<string>();

      // ---- Targeted pass around the known finalize block (≤10 blocks inclusive) ----
      if (hintBlock) {
        // Use 10 blocks total: [hint-4, hint+5] (difference 9 → 10 inclusive)
        const hFrom = hintBlock > 4n ? (hintBlock - 4n) : 0n;
        const hTo   = hintBlock + 5n;

        try {
          const logs = await getWindowLogs(hFrom, hTo);
          for (const lg of logs) {
            const key = `${(lg as any).transactionHash}:${(lg as any).logIndex}`;
            if (!seen.has(key)) { seen.add(key); allLogs.push(lg); }
          }
          console.log(`[Winners] targeted found: ${logs.length} in ${Number(hFrom)} → ${Number(hTo)}`);
        } catch (e: any) {
          // If Alchemy still objects, split into two sub-windows: [hFrom,hint] and [hint+1,hTo]
          console.warn('[Winners] targeted window split fallback:', e?.message || e);
          const leftFrom = hFrom;
          const leftTo   = hintBlock;     // inclusive
          const rightFrom= hintBlock + 1n;
          const rightTo  = hTo;           // inclusive

          const [L, R] = await Promise.allSettled([
            getWindowLogs(leftFrom, leftTo),
            getWindowLogs(rightFrom, rightTo),
          ]);

          const add = (arr: any[] | undefined) => {
            if (!arr) return;
            for (const lg of arr) {
              const key = `${(lg as any).transactionHash}:${(lg as any).logIndex}`;
              if (!seen.has(key)) { seen.add(key); allLogs.push(lg); }
            }
          };

          add(L.status === 'fulfilled' ? L.value : undefined);
          add(R.status === 'fulfilled' ? R.value : undefined);

          console.log('[Winners] targeted (split) total added:', allLogs.length);
        }
      }

      // ---- Sweep in small windows from `from` to `latest` ----
      let cur = from;
      let windowsUsed = 0;
      const MAX_WINDOWS = 600;

      while (cur <= latest && windowsUsed < MAX_WINDOWS) {
        const to = cur + WINDOW > latest ? latest : cur + WINDOW;
        let logs: any[] = [];
        try {
          logs = await getWindowLogs(cur, to);
        } catch (e: any) {
          console.warn('[Winners] window error, skipping', { from: Number(cur), to: Number(to) }, e?.message || e);
        }

        if (logs.length) {
          console.log(`[Winners] window hit (${Number(WINDOW)}): ${logs.length} in ${Number(cur)} → ${Number(to)}`);
          for (const lg of logs) {
            const key = `${(lg as any).transactionHash}:${(lg as any).logIndex}`;
            if (!seen.has(key)) { seen.add(key); allLogs.push(lg); }
          }
        }

        await sleep(300);
        cur = to + 1n;
        windowsUsed++;

        // One round is enough to render for now.
        if (allLogs.length >= 3) break;
      }

      console.log('[Winners] total logs found:', allLogs.length);

      // ---- Aggregate winners & totals (decode by name OR index) ----
      let paid = 0n;
      const map = new Map<string, bigint>();

      for (const lg of allLogs) {
        const a: any = (lg as any).args;
        const roundId: bigint | undefined = a?.roundId ?? a?.[0];
        const winners: (`0x${string}` | undefined)[] | undefined = a?.winners ?? a?.[1];
        const prize: bigint | undefined = a?.prizePool ?? a?.[2];

        if (prize === undefined || winners === undefined) continue;

        if ((window as any).__winnersDebugPrinted !== true) {
          console.log('[Winners] sample decoded', {
            roundId: typeof roundId === 'bigint' ? Number(roundId) : roundId,
            prize: prize.toString(),
            winners,
          });
          (window as any).__winnersDebugPrinted = true;
        }

        paid += prize;

        for (let i = 0; i < Math.min(5, winners.length); i++) {
          const addr = winners[i];
          if (!addr || addr === '0x0000000000000000000000000000000000000000') continue;
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
        Based on on-chain <code>RoundFinalized</code> events since deploy. Uses 10-block windows (and splits when needed) to fit Alchemy Free limits.
      </div>
    </div>
  );
}
