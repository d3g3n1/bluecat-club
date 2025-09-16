import React from 'react';
export default function Community(){
  return (
    <div id='community' className='card neon-border' style={{display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:18}}>
      <div>
        <div className='title-xl' style={{fontSize:24}}>Join the Club — winners, votes, memes.</div>
        <p className='muted'>Hop in to see daily winners, roadmap drops, and a lot of cat energy.</p>
      </div>
      <div className='row'>
        <a className='pill' aria-label='Open Telegram' title='Telegram' href='https://t.me/' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/telegram.svg' style={{width:22,height:22}}/>
        </a>
        <a className='pill' aria-label='Open X' title='X / Twitter' href='https://x.com/' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/x.svg' style={{width:22,height:22}}/>
        </a>
        <a className='pill' aria-label='Open Docs' title='Docs' href='#' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/docs.svg' style={{width:22,height:22}}/>
        </a>
      </div>
    </div>
  );
}
