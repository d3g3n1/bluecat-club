import React from 'react';
import { RAFFLE_ADDRESS, VAULT_ADDRESS, TOSHI_ADDRESS, BCAT_ADDRESS } from '../config/addresses';

type ChipProps = { label: string; address: string };

function Chip({ label, address }: ChipProps){
  const scan = 'https://basescan.org/address/' + address;
  function copy(){ navigator.clipboard.writeText(address); }

  return (
    <div
      className='chip'
      style={{
        display:'grid', gridTemplateColumns:'minmax(0,1fr) auto auto',
        alignItems:'center', gap:10, width:'100%', maxWidth:'100%',
        boxSizing:'border-box', overflow:'hidden',
      }}
    >
      <div
        style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
        title={address}
      >
        <b>{label}</b>&nbsp;<span style={{opacity:.9}}>{address}</span>
      </div>

      <button className='pill' onClick={copy} aria-label='Copy' title='Copy' style={{padding:'6px 8px'}}>
        <img src='/copy.svg' style={{width:16,height:16}}/>
      </button>
      <a className='pill' href={scan} target='_blank' rel='noreferrer' aria-label='View on BaseScan' title='View on BaseScan' style={{padding:'6px 8px'}}>
        <img src='/external.svg' style={{width:16,height:16}}/>
      </a>
    </div>
  );
}

export default function Contracts(){
  const raffle = RAFFLE_ADDRESS as string;
  const vault  = VAULT_ADDRESS as string;
  const toshi  = TOSHI_ADDRESS as string;
  const bcat   = (BCAT_ADDRESS as string) || '0xyourtokenaddress';

  return (
    <div id='contracts' style={{display:'grid', gap:18}}>
      <div className='card neon-border'>
        <div className='title-xl' style={{fontSize:24}}>Contracts</div>
        <div style={{display:'grid', gap:14, marginTop:12}}>
          <Chip label='Raffle' address={raffle}/>
          <Chip label='Vault'  address={vault}/>
          <Chip label='TOSHI'  address={toshi}/>
          <Chip label='BCAT'   address={bcat}/>
        </div>
      </div>

      <div className='card neon-border'>
        <div className='title-xl' style={{fontSize:24}}>Fairness</div>
        <p className='muted'>
          Draws use a commit–reveal seed from the operator combined with the last block hash at close time.
          Anyone can verify the seed hash, the final seed, and the winner selection on-chain. Winners are unique
          and ticket-weighted.
        </p>
      </div>
    </div>
  );
}
