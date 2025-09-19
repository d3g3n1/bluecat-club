// src/components/Hero.tsx
import React from 'react';
import { publicClient } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { RAFFLE_ADDRESS } from '../config/addresses';
import { formatToken, useCountUp } from '../lib/format';

function Progress({
  openAt,
  closeAt,
  nowMs,
}: {
  openAt: number;
  closeAt: number;
  nowMs: number;
}) {
  const total = Math.max(1, closeAt - openAt);
  const elapsed = Math.max(0, Math.min(total, Math.floor(nowMs / 1000) - openAt));
  const pct = Math.round((elapsed / total) * 100);
  const remain = Math.max(0, closeAt * 1000 - nowMs);
  const breath = remain <= 10 * 60 * 1000;

  return (
    <div>
      <div className={'progress' + (breath ? ' breath' : '')} aria-label="progress to draw">
        <i style={{ width: pct + '%' }} />
      </div>
      <small className="muted">All times in ET</small>
    </div>
  );
}

export default function Hero() {
  const [pot, setPot] = React.useState<bigint | null>(null);
  const [openAt, setOpenAt] = React.useState(0);   // epoch seconds
  const [closeAt, setCloseAt] = React.useState(0); // epoch seconds
  const [nowMs, setNowMs] = React.useState(() => Date.now()); // real-time clock

  async function load() {
    try {
      const [id, o, c, p] = (await publicClient.readContract({
        address: RAFFLE_ADDRESS,
        abi: RAFFLE_ABI,
        functionName: 'currentRound',
      })) as any;
      setOpenAt(Number(o));
      setCloseAt(Number(c));
      setPot(p as bigint);
    } catch {
      // ignore transient read errors
    }
  }

  // Poll on-chain state every 8s
  React.useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  // 1s ticking clock for live countdown/progress
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // If we hit 0, nudge a refresh shortly after to catch the next round
  React.useEffect(() => {
    const remainMs = Math.max(0, closeAt * 1000 - nowMs);
    if (remainMs === 0 && closeAt > 0) {
      const t = setTimeout(load, 2500);
      return () => clearTimeout(t);
    }
  }, [nowMs, closeAt]);

  const shown = useCountUp(pot ?? 0n);
  const remainMs = Math.max(0, closeAt * 1000 - nowMs);
  const isLive = closeAt > 0 && remainMs > 0; // round open while countdown > 0

  const s = Math.floor(remainMs / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');

  return (
    <>
      {/* Local styles for the status dot */}
      <style>{`
        .statusline { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .statusline small { font-size: 12px; letter-spacing: .2px; }
        .dot {
          width: 8px; height: 8px; border-radius: 999px; display: inline-block;
          animation: pulse 1.2s ease-in-out infinite;
          box-shadow: 0 0 0 0 rgba(0,0,0,0);
        }
        .dot--green { background: #18c37e; }
        .dot--amber { background: #ffb020; }
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: .75; }
          50% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(0.9); opacity: .75; }
        }
      `}</style>

      {/* LEFT: copy + numbers */}
      <div>
        <div className="title-xl">Play. Win. Every Day.</div>
        <div className="muted" style={{ fontSize: 18, marginTop: 6 }}>
          Daily <b>$TOSHI</b> lottery on Base. 5 unique winners at 10:00 PM ET.
        </div>
        <div style={{ height: 10 }} />

        {/* Status label just above the big number */}
        <div className="statusline">
          <span className={`dot ${isLive ? 'dot--green' : 'dot--amber'}`} aria-hidden />
          <small className="muted">
            {isLive ? 'Current Pot' : 'Finalizing previous Round: Draw in progress'}
          </small>
        </div>

        {pot === null ? (
          <div className="skeleton" style={{ width: 320, height: 44 }} />
        ) : (
          <div className="big-amount">{formatToken(shown)} TOSHI</div>
        )}
        <div className="digital">⏳ {h}:{m}:{sec}</div>
        <div style={{ height: 10 }} />
        <Progress openAt={openAt} closeAt={closeAt} nowMs={nowMs} />
        <div style={{ height: 14 }} />

        {/* CTA row — Buy $BCAT + View Winners */}
        <div className="row">
          <a
            className="pill cta"
            href="https://toshimart.xyz/0x681e0a28637e9f9a70fb9fc6424489d8c8cb8453"
            target="_blank"
            rel="noreferrer"
            aria-label="Buy BCAT on ToshiMart"
            title="Buy $BCAT"
          >
            Buy $BCAT
          </a>
          <a className="pill" href="#winners" style={{ background: 'transparent' }}>
            View Winners
          </a>
        </div>

        <div style={{ height: 6 }} />
        <small className="muted">
          On-chain draw nightly at 10:00 PM ET. Fees reward $BCAT stakers.
        </small>
      </div>

      {/* RIGHT: mascot — perfectly centered & bigger */}
      <div
        style={{
          position: 'relative',
          minHeight: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src="/mascot.svg"
          alt="BlueCat"
          style={{
            width: 300,
            height: 300,
            display: 'block',
            margin: '0 auto',
            filter: 'drop-shadow(0 0 30px rgba(54,194,255,.5))',
          }}
        />
      </div>
    </>
  );
}
