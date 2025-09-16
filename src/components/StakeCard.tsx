// src/components/StakeCard.tsx
import React from 'react';

export default function StakeCard(){
  return (
    <div title='BCAT staking will power governance + club perks. Launching after MVP.' style={{position:'relative', overflow:'hidden'}}>
      <div className='title-xl' style={{fontSize:22, marginBottom:8, display:'flex', alignItems:'center', gap:10}}>
        Stake $BCAT <span className='muted'>(Coming Soon)</span>
        <span className='chip' aria-label='locked' title='Locked'>
          🔒 Locked
        </span>
      </div>

      {/* Disabled metrics */}
      <div className='row' style={{marginBottom:10}}>
        <div className='chip'>My Stake: —</div>
        <div className='chip'>Pending: —</div>
        <div className='chip'>Recent yield: —</div>
      </div>

      {/* Disabled controls */}
      <div className='row' aria-disabled='true'>
        <input disabled placeholder='Amount (e.g. 100)' />
        <button className='pill' disabled>Stake</button>
        <button className='pill' disabled>Unstake</button>
        <button className='pill cta' disabled>Claim</button>
      </div>

      <div className='muted' style={{ marginTop: 8 }}>
        BCAT staking will power governance + club perks. Launching after MVP.
      </div>

      {/* Diagonal translucent stripe overlay */}
      <div aria-hidden='true' style={{
        position:'absolute', inset:0, pointerEvents:'none',
        background: `repeating-linear-gradient(
          -35deg,
          rgba(255,255,255,0.06) 0px,
          rgba(255,255,255,0.06) 12px,
          rgba(255,255,255,0.00) 12px,
          rgba(255,255,255,0.00) 24px
        )`
      }}/>
    </div>
  );
}
