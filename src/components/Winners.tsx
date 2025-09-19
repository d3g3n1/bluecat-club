// src/components/Winners.tsx
import React from 'react';
import { createPublicClient, http, decodeEventLog, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Row = { prize: bigint; winners: `0x${string}`[]; bn: number };
type LastWinnerLine = { address: `0x${string}`, total: bigint };

const SHARES = [45n, 25n, 15n, 10n, 5n] as const;

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
const ZERO = '0x0000000000000000000000000000000000000000';

export default function Winners() {
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [lastWinners, setLastWinners] = React.useState<LastWinnerLine[]>([]);

  async function getWindowRawLogs(from: bigint, to: bigint, retries = 2) {
    try {
      // raw logs (no ABI) → we’ll decode locally so we can keep windows tiny
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
      const prize: bigint | undefined = a?.prizePool ?? a?.[2];
      const winners: (`0x${string}` | undefined)[] | undefined = a?.winners ?? a?.[1];
      if (!prize || !winners) return undefined;

      return { prize, winners: winners as `0x${string}`[] };
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

      // start window: max(latest - maxBack, deployBlock)
      let from = latest > maxBack ? (latest - maxBack) : 0n;
      if (deployBlock > from) from = deployBlock;

      // ≤10 blocks inclusive on Alchemy Free → choose 9 so [cur, cur+9] spans 10 blocks
      const WINDOW = 9n;

      const decoded: Row[] = [];
      const seen = new Set<string>();

      // --- 1) Target a small band around a known finalize block if provided ---
      if (hintBlock) {
        const hFrom = hintBlock > 4n ? (hintBlock - 4n) : 0n; // 10 blocks inclusive: [hint-4, hint+5]
        const hTo   = hintBlock + 5n;
        try {
          const raws = await getWindowRawLogs(hFrom, hTo);
          for (const lg of raws) {
            const key = `${lg.transactionHash}:${lg.logIndex}`;
            if (seen.has(key)) continue;
            const d = tryDecode(lg);
            if (!d) continue;
            seen.add(key);
            decoded.push({ prize: d.prize, winners: d.winners, bn: Number(lg.blockNumber ?? 0) });
          }
        } catch (e) {
          // split fallback in case provider is picky on off-by-one
          const parts = await Promise.allSettled([
            getWindowRawLogs(hFrom, hintBlock),
            getWindowRawLogs(hintBlock + 1n, hTo),
          ]);
          for (const part of parts) {
            if (part.status !== 'fulfilled') continue;
            for (const lg of part.value) {
              const key = `${lg.transactionHash}:${lg.logIndex}`;
              if (seen.has(key)) continue;
              const d = tryDecode(lg);
              if (!d) continue;
              seen.add(key);
              decoded.push({ prize: d.prize, winners: d.winners, bn: Number(lg.blockNumber ?? 0) });
            }
          }
        }
      }

      // --- 2) Sweep forward in tiny windows until we find at least one finalize ---
      let cur = from;
      let windowsUsed = 0;
      const MAX_WINDOWS = 600;

      while (cur <= latest && windowsUsed < MAX_WINDOWS && decoded.length === 0) {
        const to = cur + WINDOW > latest ? latest : cur + WINDOW;

        try {
          const raws = await getWindowRawLogs(cur, to);
          for (const lg of raws) {
            const key = `${lg.transactionHash}:${lg.logIndex}`;
            if (seen.has(key)) continue;
            const d = tryDecode(lg);
            if (!d) continue;
            seen.add(key);
            decoded.push({ prize: d.prize, winners: d.winners, bn: Number(lg.blockNumber ?? 0) });
          }
        } catch (e) {
          // skip this window on hiccup
        }

        await sleep(300);
        cur = to + 1n;
        windowsUsed++;
      }

      // ---- Build UI state ----
      // 1) Total paid = sum of prizes we decoded in this scan window
      const total = decoded.reduce((acc, r) => acc + r.prize, 0n);
      setTotalPaid(total);

      // 2) Last round winners = winners from the most recent finalize we saw
      if (decoded.length === 0) {
        setLastWinners([]);
      } else {
        const recent = decoded.reduce((a, b) => (b.bn >= a.bn ? b : a));
        const lines: LastWinnerLine[] = [];
        for (let i = 0; i < 5; i++) {
          const addr = recent.winners[i];
          if (!addr || addr === ZERO) continue;
          const amt = (recent.prize * SHARES[i]) / 100n;
          lines.push({ address: addr, total: amt });
        }
        setLastWinners(lines);
      }
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

      {/* Total paid out so far (from scanned window) */}
      <div className="muted" style={{ marginBottom: 6 }}>Total paid out so far</div>
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
          <div className="muted">No finalized round found in the recent scan window.</div>
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
        Based on on-chain <code>RoundFinalized</code> events scanned in ≤10-block windows (Alchemy Free-tier friendly).
      </div>
    </div>
  );
}
