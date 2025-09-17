// src/components/HowStakingWorks.tsx
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

export default function HowStakingWorks(){
  return (
    <div className='card neon-border' style={{padding:18}}>
      <div className='row' style={{justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
        <div className='title-xl' style={{fontSize:20, display:'flex', alignItems:'center', gap:10}}>
          {/* small section icon */}
          <img className="section-icon" src="/mascot2.svg" alt="BlueCat" style={{width:22,height:22,borderRadius:6}}/>
          How $BCAT Staking Works
        </div>
      </div>

      {/* Steps (desktop: 4 cols; mobile: horizontal snap) */}
      <div
        className="grid snapgrid"
        style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(220px, 1fr))', gap:12 }}
      >
        <Step n={1} title='Stake $BCAT (Coming Soon)'
          body='Lock BCAT to share in platform fees (paid in $TOSHI) and unlock future club perks/governance.'
          icon='🔒' />
        <Step n={2} title='Earn Fee Rewards'
          body='A portion of the platform fee is routed to stakers. Rewards accrue automatically.'
          icon='💎' />
        <Step n={3} title='Claim in $TOSHI'
          body='Claim your accumulated rewards in TOSHI once staking goes live.'
          icon='⚡' />
        <Step n={4} title='Unstake When Ready'
          body='You can unstake your BCAT whenever staking is active (subject to any launch rules).'
          icon='↩️' />
      </div>

      <div className='row' style={{marginTop:14, flexWrap:'wrap', gap:8}}>
        <Chip>Rewards in $TOSHI</Chip>
        <Chip>60% of fee to stakers (when live)</Chip>
        <Chip>40% of fee to treasury</Chip>
      </div>

      {/* Scoped mobile styles to enable scroll-snap + smaller icon */}
      <style>{`
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
