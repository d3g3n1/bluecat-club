import React from 'react';

export default function Footer(){
  return (
    <footer
      className='glass'
      style={{
        borderRadius:16,
        padding:14,
        display:'grid',
        gridTemplateColumns:'1fr auto',
        alignItems:'center',
        marginTop:18
      }}
    >
      <div className='muted'>© BlueCat Club • On Base • Please play responsibly.</div>

      <div className='row' style={{gap:8}}>
        {/* Replace '#' with your real links when ready */}
        <a className='pill' aria-label='Open X' title='X / Twitter' href='#' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/x.svg' style={{width:22,height:22}}/>
        </a>
        <a className='pill' aria-label='Open Telegram' title='Telegram' href='#' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/telegram.svg' style={{width:22,height:22}}/>
        </a>
        <a className='pill' aria-label='Open GitHub' title='GitHub' href='#' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/github.svg' style={{width:22,height:22}}/>
        </a>
      </div>
    </footer>
  );
}
