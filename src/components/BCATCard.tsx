import React from 'react';
import { BCAT_ADDRESS } from '../config/addresses';
export default function BCATCard(){
  const addr = BCAT_ADDRESS || '0xBCAT…PLACEHOLDER';
  return (
    <div id='bcat' className='card neon-border' style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:16}}>
      <img src='/docs.svg' alt='' style={{width:28,height:28,opacity:.9}}/>
      <div>
        <div className='title-xl' style={{fontSize:24}}>$BCAT — Governance Token</div>
        <p className='muted'>$BCAT is the BlueCat Club governance token. Holders guide roadmap, fees policy, and feature launches.</p>
        <div className='row'>
          <span className='chip'>Supply: 1,000,000,000</span>
          <span className='chip'>Standard: ERC-20 on Base</span>
          <span className='chip'>Fees: 0% buy/sell</span>
          <span className='chip'>Contract: {addr}</span>
        </div>
        <div style={{height:10}}/>
        <div className='row'>
          <a className='pill cta-ghost' href='#buy-bcat'>Buy $BCAT</a>
          <a className='pill' href={BCAT_ADDRESS ? 'https://basescan.org/address/'+BCAT_ADDRESS : '#'} target='_blank' rel='noreferrer'>View on BaseScan</a>
        </div>
        <div style={{height:8}}/>
        <small className='muted'>Phase 1: Snapshot-style votes • Phase 2: on-chain treasury votes • Phase 3: proposals for new game modes.</small>
      </div>
    </div>
  );
}
