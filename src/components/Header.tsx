// src/components/Header.tsx
import React from 'react';
import {
  connectWith,
  subscribeToWalletChanges,
  getTokenBalance,
  hardDisconnect,
} from '../lib/eth';
import { TOSHI_ADDRESS } from '../config/addresses';

function short(addr: string) {
  return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '';
}

type Kind = 'metamask' | 'phantom' | 'coinbase';

function useWalletAvailability() {
  const [found, setFound] = React.useState({ metamask: false, phantom: false, coinbase: false });
  React.useEffect(() => {
    const w = window as any;
    const has = (pred: (p: any) => boolean) =>
      !!w.ethereum?.providers?.some?.(pred) || pred(w.ethereum);

    setFound({
      metamask: !!w.ethereum?.isMetaMask || has((p: any) => !!p?.isMetaMask || (!p?.isCoinbaseWallet && !p?.isPhantom)),
      phantom:  !!w.phantom?.ethereum || !!w.ethereum?.isPhantom || has((p: any) => !!p?.isPhantom),
      coinbase: !!w.ethereum?.isCoinbaseWallet || has((p: any) => !!p?.isCoinbaseWallet),
    });
  }, []);
  return found;
}

function Row({ icon, label, onClick, disabled, note }:{
  icon: string; label: string; onClick: () => void; disabled?: boolean; note?: string;
}) {
  return (
    <button
      className="pill"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{
        display:'flex', alignItems:'center', gap:10, justifyContent:'flex-start',
        width:'100%', padding:'12px 14px', background:'rgba(255,255,255,.05)',
        border:'1px solid #173040', borderRadius:14, opacity: disabled ? .55 : 1
      }}
    >
      <img src={icon} alt="" style={{ width:22, height:22 }} />
      <span style={{ fontWeight:600 }}>{label}</span>
      {note && <span className="muted" style={{ marginLeft:'auto', fontSize:13 }}>{note}</span>}
    </button>
  );
}

export default function Header({ onConnect }: { onConnect: (a: string) => void }) {
  const [addr, setAddr] = React.useState<string>('');
  const [toshi, setToshi] = React.useState<string>('');
  const [showPicker, setShowPicker] = React.useState(false);
  const found = useWalletAvailability();

  async function refreshBalance(a: string) {
    try {
      if (!a || !TOSHI_ADDRESS) { setToshi(''); return; }
      const b = await getTokenBalance(a as `0x${string}`, TOSHI_ADDRESS as `0x${string}`);
      setToshi(b.formatted.toLocaleString(undefined, { maximumFractionDigits: 4 }));
    } catch { setToshi(''); }
  }

  async function onChoose(kind: Kind) {
    try {
      const accs = await connectWith(kind);
      const a = accs[0] || '';
      if (!a) throw new Error('No account returned from wallet');
      setAddr(a);
      onConnect(a);
      refreshBalance(a);
      setShowPicker(false);
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  }

  async function disconnect() {
    try { await hardDisconnect(); } catch {}
    setAddr('');
    setToshi('');
    onConnect('');
  }

  React.useEffect(() => {
    const unsub = subscribeToWalletChanges(
      (accs) => {
        const a = (accs && accs[0]) || '';
        setAddr(a);
        onConnect(a);
        refreshBalance(a);
      },
      () => { if (addr) refreshBalance(addr); }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);

  return (
    <div className="glass nav" style={{ position:'relative', zIndex: 10 }}>
      {/* Brand */}
      <div className="brand">
        <img src="/mascot2.svg" alt="BlueCat" />
        <div>BlueCat Club <span className="chip" style={{ marginLeft: 8 }}>$BCAT</span></div>
      </div>

      {/* Right side */}
      <div className="row" style={{ gap: 8, alignItems:'center' }}>
        <a className="pill" href="#raffle">Raffle</a>
        <a className="pill" href="#stake">Stake</a>
        <a className="pill" href="#community">Community</a>
        <a className="pill" href="#faq">FAQ</a>
        <a className="pill" href="#contracts">Contracts</a>

        {addr && toshi && (
          <span className="chip" title="TOSHI balance">{toshi} TOSHI</span>
        )}

        {!addr ? (
          <button className="pill cta" onClick={() => { console.log('Connect clicked'); setShowPicker(true); }} aria-label="Connect wallet">
            Connect Wallet
          </button>
        ) : (
          <>
            <span className="chip" title={addr}>{short(addr)}</span>
            <button className="pill cta" onClick={disconnect} aria-label="Disconnect wallet">Disconnect</button>
          </>
        )}
      </div>

      {/* Inline (no-portal) picker */}
      {showPicker && (
        <div
          onClick={() => setShowPicker(false)}
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'grid',
            placeItems:'center', zIndex: 9999, backdropFilter:'blur(2px)'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background:'#0b1521', border:'1px solid #193047', borderRadius:14,
              padding:18, width:420, maxWidth:'92vw', boxShadow:'0 12px 48px rgba(0,0,0,.55)'
            }}
          >
            <div style={{ fontWeight:800, fontSize:18, marginBottom:14 }}>Choose a wallet</div>
            <div style={{ display:'grid', gap:10 }}>
              <Row icon="/metamask.svg" label="MetaMask" onClick={() => onChoose('metamask')}
                   disabled={!found.metamask} note={!found.metamask ? 'not found' : undefined} />
              <Row icon="/phantom.svg" label="Phantom (EVM)" onClick={() => onChoose('phantom')}
                   disabled={!found.phantom} note={!found.phantom ? 'not found' : undefined} />
              <Row icon="/coinbase.svg" label="Coinbase Wallet" onClick={() => onChoose('coinbase')}
                   disabled={!found.coinbase} note={!found.coinbase ? 'not found' : undefined} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
