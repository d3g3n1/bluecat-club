// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http, decodeEventLog, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };
const shares = [45n, 25n, 15n, 10n, 5n] as const;

// Dedicated logs RPC (Alchemy URL recommended)
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

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

  async function getWindowRawLogs(from: bigint, to: bigint, retries = 2) {
    try {
      // no ABI/eventName → raw topics/data; we’ll decode locally
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

      // args by name (and fallback by index for safety)
      const a: any = args;
      const prize: bigint | undefined = a?.prizePool ?? a?.[2];
      const winners: (`0x${string}` | undefined)[] | undefined = a?.winners ?? a?.[1];

      if (!prize || !winners) return undefined;

      return { prize, winners };
    } catch {
      return undefined;
    }
  }

  async function load() {
    setLoading(true);
    try {
      const latest = await logsClient.getBlockNumber();
      const maxBack = BigInt((import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '10000');
      const deployBlock = BigInt((import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0');
      const hintBlockEnv = (import.meta.env.VITE_HINT_FINALIZE_BLOCK as string) || '';
      const hintBlock = hintBlockEnv ? BigInt(hintBlockEnv) : undefined;

      let from = latest > maxBack ? (latest - maxBack) : 0n;
      if (deployBlock > from) from = deployBlock;

      // ≤10 blocks inclusive → window size 9 (cur..cur+9)
      const WINDOW = 9n;

      console.log('[BlueCat] RPC_URL in bundle:', LOGS_URL);
      console.log('[Winners] addr=', RAFFLE_ADDRESS);
      console.log('[Winners] latest=', Number(latest), 'from=', Number(from), 'hint=', hintBlock ? Number(hintBlock) : 'none');

      const allDecoded: { prize: bigint; winners: `0x${string}`[] }[] = [];
      const seen = new Set<string>();

      // --- 1) Targeted pass around a known finalize block: [hint-4, hint+5] (10 blocks inclusive) ---
      if (hintBlock) {
        const hFrom = hintBlock > 4n ? (hintBlock - 4n) : 0n;
        const hTo   = hintBlock + 5n;

        try {
          const raws = await getWindowRawLogs(hFrom, hTo);
          const these = raws
            .filter((lg: any) => {
              const key = `${lg.transactionHash}:${lg.logIndex}`;
              if (seen.has(key)) return false;
              const dec = tryDecode(lg);
              if (!dec) return false;
              seen.add(key);
              allDecoded.push({ prize: dec.prize, winners: dec.winners as `0x${string}`[] });
              return true;
            });
          console.log(`[Winners] targeted found: ${these.length} in ${Number(hFrom)} → ${Number(hTo)}`);
        } catch (e: any) {
          // If Alchemy still complains (unlikely now), split into two sub-windows
          console.warn('[Winners] targeted window split fallback:', e?.message || e);
          const leftFrom = hFrom, leftTo = hintBlock;
          const rightFrom = hintBlock + 1n, rightTo = hTo;
          const parts = await Promise.allSettled([
            getWindowRawLogs(leftFrom, leftTo),
            getWindowRawLogs(rightFrom, rightTo),
          ]);
          for (const part of parts) {
            if (part.status !== 'fulfilled') continue;
            for (const lg of part.value) {
              const key = `${lg.transactionHash}:${lg.logIndex}`;
              if (seen.has(key)) continue;
              const dec = tryDecode(lg);
              if (!dec) continue;
              seen.add(key);
              allDecoded.push({ prize: dec.prize, winners: dec.winners as `0x${string}`[] });
            }
          }
          console.log('[Winners] targeted (split) total added so far:', allDecoded.length);
        }
      }

      // --- 2) Sweep in small windows from `from` to `latest` ---
      let cur = from;
      let windowsUsed = 0;
      const MAX_WINDOWS = 600;

      while (cur <= latest && windowsUsed < MAX_WINDOWS) {
        const to = cur + WINDOW > latest ? latest : cur + WINDOW;
        let raws: any[] = [];
        try {
          raws = await getWindowRawLogs(cur, to);
        } catch (e: any) {
          console.warn('[Winners] window error, skipping', { from: Number(cur), to: Number(to) }, e?.message || e);
        }

        let hits = 0;
        for (const lg of raws) {
          const key = `${lg.transactionHash}:${lg.logIndex}`;
          if (seen.has(key)) continue;
          const dec = tryDecode(lg);
          if (!dec) continue;
          seen.add(key);
          allDecoded.push({ prize: dec.prize, winners: dec.winners as `0x${string}`[] });
          hits++;
        }
        if (hits) console.log(`[Winners] window hit (${Number(WINDOW)}): ${hits} in ${Number(cur)} → ${Number(to)}`);

        await sleep(300);
        cur = to + 1n;
        windowsUsed++;

        // We only need a small number to render; stop early if we have any.
        if (allDecoded.length >= 1) break;
      }

      console.log('[Winners] total decoded finalize logs:', allDecoded.length);

      // --- Aggregate totals ---
      let paid = 0n;
      const map = new Map<string, bigint>();

      for (const item of allDecoded) {
        paid += item.prize;

        for (let i = 0; i < Math.min(5, item.winners.length); i++) {
          const addr = item.winners[i];
          if (!addr || addr === '0x0000000000000000000000000000000000000000') continue;
          const amt = (item.prize * shares[i]) / 100n;
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
        Based on on-chain <code>RoundFinalized</code> events since deploy. Raw logs decoded locally; windows ≤10 blocks to fit free RPC limits.
      </div>
    </div>
  );
}
