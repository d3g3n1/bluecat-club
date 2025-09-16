import React from 'react';
import { createPortal } from 'react-dom';
import {
  connectWith,
  subscribeToWalletChanges,
  getTokenBalance,
} from '../lib/eth';
import { TOSHI_ADDRESS } from '../config/addresses';

function short(addr: string) {
  return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '';
}

/* ---------------- Wallet Picker (portal) ---------------- */

type Kind = 'metamask' | 'phantom' | 'coinbase';

function useWalletAvailability() {
  const [found, setFound] = React.useState({
    metamask: false,
    phantom: false,
    coinbase: false,
  });

  React.useEffect(() => {
    const w = window as any;
    // MetaMask
    const hasMM =
      !!w.ethereum?.isMetaMask ||
      Array.isArray(w.ethereum?.providers) &&
        !!w.ethereum.providers.find((p: any) => p.isMetaMask);

    // Phantom EVM (make sure Phantom’s “Ethereum & Polygon” is enabled)
    const hasPhantom =
      !!w.phantom?.ethereum ||
      !!w.ethereum?.isPhantom ||
      (Array.isArray(w.ethereum?.providers) &&
        !!w.ethereum.providers.find((p: any) => p.isPhantom));

    // Coinbase Wallet
    const hasCB =
      !!w.ethereum?.isCoinbaseWallet ||
      (Array.isArray(w.ethereum?.providers) &&
        !!w.ethereum.providers.find((p: any) => p.isCoinbaseWallet));

    setFound({ metamask: !!hasMM, phantom: !!hasPhantom, coinbase: !!hasCB });
  }, []);

  return found;
}

function Row({
  icon,
  label,
  onClick,
  disabled,
  note,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <button
      className="pill"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'flex-start',
        width: '100%',
        padding: '12px 14px',
        background: 'rgba(255,255,255,.05)',
        border: '1px solid #173040',
        borderRadius: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <img src={icon} alt="" style={{ width: 22, height: 22 }} />
      <span style={{ fontWeight: 600 }}>{label}</span>
      {note && (
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
          {note}
        </span>
      )}
    </button>
  );
}

function WalletPicker({
  onConnected,
  onClose,
}: {
  onConnected: (address: string) => void;
  onClose: () => void;
}) {
  const found = useWalletAvailability();

  async function choose(kind: Kind) {
    try {
      const accs = await connectWith(kind);
      const a = accs[0] || '';
      if (!a) throw new Error('No account returned from wallet.');
      onConnected(a);
      onClose();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  }

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 2147483647,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0b1521',
          border: '1px solid #193047',
          borderRadius: 14,
          padding: 18,
          width: 420,
          maxWidth: '92vw',
          boxShadow: '0 12px 48px rgba(0,0,0,.55)',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 14 }}>
          Choose a wallet
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <Row
            icon="/public/metamask.svg"
            label="MetaMask"
            onClick={() => choose('metamask')}
            disabled={!found.metamask}
            note={!found.metamask ? 'not found' : undefined}
          />
          <Row
            icon="/public/phantom.svg"
            label="Phantom (EVM)"
            onClick={() => choose('phantom')}
            disabled={!found.phantom}
            note={!found.phantom ? 'not found' : undefined}
          />
          <Row
            icon="/public/coinbase.svg"
            label="Coinbase Wallet"
            onClick={() => choose('coinbase')}
            disabled={!found.coinbase}
            note={!found.coinbase ? 'not found' : undefined}
          />
        </div>

        {/* Install links */}
        <div
          className="muted"
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 13,
            alignItems: 'center',
          }}
        >
          <a
            className="pill"
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '6px 10px', background: '#0d1c31' }}
          >
            Install MetaMask
          </a>
          <span>·</span>
          <a
            className="pill"
            href="https://phantom.app/download"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '6px 10px', background: '#0d1c31' }}
          >
            Install Phantom
          </a>
          <span>·</span>
          <a
            className="pill"
            href="https://www.coinbase.com/wallet/downloads"
            target="_blank"
            rel="noreferrer"
            style={{ padding: '6px 10px', background: '#0d1c31' }}
          >
            Install Coinbase Wallet
          </a>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/* ------------------------------ Header ------------------------------ */

export default function Header({ onConnect }: { onConnect: (a: string) => void }) {
  const [addr, setAddr] = React.useState<string>('');
  const [toshi, setToshi] = React.useState<string>('');
  const [showPicker, setShowPicker] = React.useState(false);

  async function refreshBalance(a: string) {
    try {
      if (!a) { setToshi(''); return; }
      const b = await getTokenBalance(a as `0x${string}`, TOSHI_ADDRESS as `0x${string}`);
      const s = b.formatted.toLocaleString(undefined, { maximumFractionDigits: 4 });
      setToshi(s);
    } catch {
      setToshi('');
    }
  }

  function disconnect() {
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
    <div className="glass nav">
      {/* Brand */}
      <div className="brand">
        <img src="/mascot2.svg" alt="BlueCat" />
        <div>
          BlueCat Club
          <span className="chip" style={{ padding: '4px 10px', marginLeft: 8 }}>$BCAT</span>
        </div>
      </div>

      {/* Nav */}
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <a className="pill" href="#raffle">Raffle</a>
        <a className="pill" href="#stake">Stake</a>
        <a className="pill" href="#community">Community</a>
        <a className="pill" href="#faq">FAQ</a>
        <a className="pill" href="#contracts">Contracts</a>

        {/* TOSHI balance */}
        {addr && toshi && (
          <span className="chip" title="TOSHI balance" aria-label="TOSHI balance">
            {toshi} TOSHI
          </span>
        )}

        {/* Connect / Disconnect */}
        {!addr ? (
          <button
            className="pill cta"
            onClick={() => setShowPicker(true)}
            aria-label="Connect wallet"
          >
            Connect Wallet
          </button>
        ) : (
          <>
            <span className="chip" title={addr}>{short(addr)}</span>
            <button className="pill cta" onClick={disconnect} aria-label="Disconnect wallet">
              Disconnect
            </button>
          </>
        )}
      </div>

      {showPicker && (
        <WalletPicker
          onConnected={(a) => { setAddr(a); onConnect(a); refreshBalance(a); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
