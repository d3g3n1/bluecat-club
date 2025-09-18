// src/components/Winners.tsx
import React from 'react';
import { publicClient } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';

type Leader = { address: `0x${string}`, total: bigint };

function short(a: string) { return a ? a.slice(0,6) + '…' + a.slice(-4) : ''; }

export default function Winners(){
  const [loading, setLoading] = React.useState(true);
  const [totalPaid, setTotalPaid] = React.useState<bigint>(0n);
  const [leaders, setLeaders] = React.useState<Leader[]>([]);

  async function load(){
    setLoading(true);
    try{
      // ---------------- block range selection ----------------
      const envFrom = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      let fromBlock = BigInt(envFrom || '0');

      const latest = await publicClient.getBlockNumber();

      // To avoid strict RPC limits (Alchemy Free), only scan a recent window.
      // Adjust if needed. 50k blocks ~ a few hours/days depending on chain.
      const MAX_SCAN_BACK = BigInt(
        (import.meta.env.VITE_MAX_SCAN_BACK_BLOCKS as string) || '50000'
      );

      if (fromBlock === 0n || latest - fromBlock > MAX_SCAN_BACK) {
        fromBlock = latest > MAX_SCAN_BACK ? latest - MAX_SCAN_BACK : 0n;
      }

      const toBlock = latest;

      // ---------------- chunked getLogs ----------------
      // Try a reasonable window first; if we hit Alchemy Free's 10-block limit,
      // we will shrink automatically.
      let windowSize = 2000n;  // good on most providers
      const minWindow  = 10n;  // Alchemy Free hard limit
      const logs: any[] = [];

      let start = fromBlock;
      let iterations = 0;

      while (start <= toBlock) {
        iterations++;
        if (iterations > 120) {
          // guardrail against making too many requests in browser
          // (≈ 120 windows should be plenty for a recent deploy)
          break;
        }

        let end = start + windowSize;
        if (end > toBlock) end = toBlock;

        try {
          const chunk = await publicClient.getLogs({
            address: RAFFLE_ADDRESS,
            abi: RAFFLE_ABI as any,
            eventName: 'RoundFinalized',
            fromBlock: start,
            toBlock: end,
          });
          logs.push(...chunk);
          // if success, move forward
          start = end + 1n;
        } catch (e: any) {
          const msg = String(e?.message || e);
          // Alchemy Free error looks like:
          // code -32600 with message “... up to a 10 block range ...”
          const isRangeErr = msg.includes('10 block range') || msg.includes('block range');

          if (isRangeErr && windowSize > minWindow) {
            windowSize = minWindow; // shrink and retry this window
            continue;
          }

          // transient issues – reduce by 2x and retry once
          if (windowSize > minWindow) {
            windowSize = windowSize / 2n;
            if (windowSize < minWindow) windowSize = minWindow;
            continue;
          }

          // give up on this small window – skip ahead a little to avoid a hard-stall
          console.warn('[Winners] skipping window due to error:', e);
          start = end + 1n;
        }
      }

      // ---------------- aggregate results ----------------
      let paid = 0n;
      const map = new Map<string, bigint>();
      const shares = [45n,25n,15n,10n,5n];

      for (const lg of logs){
        const prize = lg.args?.prizePool as bigint;
        const winners = lg.args?.winners as `0x${string}`[];
        if (!prize || !winners) continue;

        paid += prize;

        for (let i=0; i<Math.min(5, winners.length); i++){
          const addr = winners[i];
          if (!addr) continue;
          const amt = (prize * shares[i]) / 100n;
          map.set(addr, (map.get(addr) || 0n) + amt);
        }
      }

      const arr = Array.from(map.entries())
        .map(([address, total]) => ({ address: address as `0x${string}`, total }))
        .sort((a,b)=> (a.total > b.total ? -1 : 1))
        .slice(0,3);

      setTotalPaid(paid);
      setLeaders(arr);
    }catch(e){
      console.error('[Winners] load error', e);
    }finally{
      setLoading(false);
    }
  }

  React.useEffect(()=>{ load(); },[]);

  return (
    <div id="winners" className="card neon-border" style={{ padding: 18 }}>
      <div className="title-xl" style={{ fontSize: 24, marginBottom: 8 }}>
        Winners
      </div>

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
        Based on on-chain <code>RoundFinalized</code> events since (scanned) deploy window.
      </div>
    </div>
  );
}
