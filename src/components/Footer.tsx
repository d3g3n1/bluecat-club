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
        <a className='pill' aria-label='Open X' title='X / Twitter'
           href='https://x.com/bluecat_club' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/x.svg' style={{width:22,height:22}}/>
        </a>
        <a className='pill' aria-label='Open Telegram' title='Telegram'
           href='https://t.me/bluecatclub' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/telegram.svg' style={{width:22,height:22}}/>
        </a>
        <a className='pill' aria-label='Open GitHub' title='GitHub'
           href='https://github.com/d3g3n1/bluecat-club' target='_blank' rel='noreferrer' style={{background:'#0d1c31'}}>
          <img src='/github.svg' style={{width:22,height:22}}/>
        </a>
      </div>
    </footer>
  );
}
