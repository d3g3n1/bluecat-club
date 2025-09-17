// src/components/HowItWorks.tsx
import React from 'react';

const badge: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 999, display:'grid', placeItems:'center',
  background:'var(--grad-primary)', color:'#061018', fontWeight:800, fontSize:13
};

const stepBox: React.CSSProperties = {
  padding: '14px 14px',
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,.05)',
  boxShadow: 'var(--edge-glow)',
  transition: 'transform .16s cubic-bezier(.22,1,.36,1), box-shadow .16s cubic-bezier(.22,1,.36,1)',
  minWidth: 0,
};

function Step({ n, title, body, icon }:{
  n:number; title:string; body:string; icon:string;
}){
  return (
    <div className='hiw-step' style={stepBox}>
      <div className='row' style={{justifyContent:'space-between'}}>
        <div style={badge}>{n}</div>
        <div aria-hidden='true' style={{opacity:.85}}>{icon}</div>
      </div>
      <div style={{fontWeight:700, fontSize:16, marginTop:10}}>{title}</div>
      <div className='muted' style={{fontSize:14, marginTop:6, lineHeight:1.45}}>{body}</div>
    </div>
  );
}

function Chip({children}:{children:React.ReactNode}){
  return <span className='chip' style={{fontSize:13}}>{children}</span>;
}

export default function HowItWorks(){
  return (
    <div id="how" className='card neon-border' style={{padding:18}}>
      <div className='row' style={{justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
        <div className='title-xl' style={{fontSize:20, display:'flex', alignItems:'center', gap:10}}>
          {/* small section icon */}
          <img className="section-icon" src="/ticket.svg" alt="Ticket" style={{width:22,height:22,borderRadius:6}}/>
          How Raffle Works
        </div>
      </div>

      {/* Steps (desktop: 4 cols; mobile: horizontal snap) */}
      <div
        className="grid snapgrid"
        style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(220px, 1fr))', gap:12 }}
      >
        <Step n={1} title='Buy Tickets in $TOSHI'
          body='Enter an amount and click Buy Tickets before the daily cut-off (10:00 PM ET).'
          icon='🎫' />
        <Step n={2} title='Prize Pool Builds'
          body='Each ticket adds to the pot. The live pool total updates in real time.'
          icon='🪙' />
        <Step n={3} title='Daily Draw @ 10:00 PM ET'
          body='Winners are drawn weighted by ticket count with 5 unique winners (no repeats).'
          icon='⏰' />
        <Step n={4} title='Payouts & Finalize'
          body='After finalize, payouts are sent automatically: 45% / 25% / 15% / 10% / 5% to five winners. (See FAQ for fee details.)'
          icon='⚡' />
      </div>

      {/* Facts */}
      <div className='row' style={{marginTop:14, flexWrap:'wrap', gap:8}}>
        <Chip>Cut-off: 10:00 PM ET</Chip>
        <Chip>Winners: 5 unique (weighted)</Chip>
        <Chip>Method: commit–reveal + last blockhash</Chip>
        <Chip>Payouts: 45/25/15/10/5</Chip>
        <Chip>Transparency: view contracts on BaseScan</Chip>
      </div>

      <div className='muted' style={{fontSize:13, marginTop:12}}>
        All rounds are on-chain. We publish a commit hash at open; after close we reveal the secret and derive winners with the last blockhash. See Fairness for details.
      </div>

      {/* Scoped styles: hover + mobile snap */}
      <style>{`
        .hiw-step:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(43,208,255,.22), 0 0 28px rgba(43,208,255,.16); }
        @media (max-width: 980px){
          .snapgrid{
            grid-template-columns: none !important;
            grid-auto-flow: column;
            grid-auto-columns: 86%;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            gap: 12px;
            padding: 4px 2px 10px 2px;
          }
          .snapgrid > *{ scroll-snap-align: start; min-width: 0; }
          .section-icon{ width:20px !important; height:20px !important; }
        }
      `}</style>
    </div>
  );
}
