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

  async function fetchFinalizedLogs(fromBlock: bigint) {
    return publicClient.getLogs({
      address: RAFFLE_ADDRESS,
      abi: RAFFLE_ABI as any,
      eventName: 'RoundFinalized',
      fromBlock,
      toBlock: 'latest'
    });
  }

  async function load(){
    setLoading(true);
    try{
      // 1) start block from env (contract creation block)
      const fromEnv = (import.meta.env.VITE_RAFFLE_DEPLOY_BLOCK as string) || '0';
      let fromBlock = 0n;
      try { fromBlock = BigInt(fromEnv); } catch { fromBlock = 0n; }

      // 2) get logs (with a small fallback window if none are found)
      let logs = await fetchFinalizedLogs(fromBlock);
      if (logs.length === 0 && fromBlock > 0n) {
        // fallback ~200k blocks earlier, just in case the env var is too high
        const fallbackFrom = fromBlock > 200000n ? fromBlock - 200000n : 0n;
        logs = await fetchFinalizedLogs(fallbackFrom);
      }

      console.log(`[Winners] Loaded ${logs.length} RoundFinalized logs`);

      let paid = 0n;
      const map = new Map<string, bigint>();
      const shares = [45n,25n,15n,10n,5n];

      for (const lg of logs){
        const prize = lg.args?.prizePool as bigint | undefined;
        // winners is a fixed array (address[5]); viem returns it as a normal array
        const winners = lg.args?.winners as readonly `0x${string}`[] | undefined;
        if (!prize || !winners) continue;

        paid += prize;

        for (let i=0; i<Math.min(5, winners.length); i++){
          const addr = winners[i];
          if (!addr || addr === '0x0000000000000000000000000000000000000000') continue;
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
        Based on on-chain <code>RoundFinalized</code> events since deploy. Payout tiers: 45/25/15/10/5 of each prize pool.
      </div>
    </div>
  );
}
