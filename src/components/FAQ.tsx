// src/components/FAQ.tsx
import React from 'react';

type QA = { q: string; a: React.ReactNode };

const ITEMS: QA[] = [
  {
    q: '🎟 How do I buy tickets?',
    a: (
      <>
        Connect your wallet, enter desired ticket count and click <b>Buy Tickets</b>. Winners are paid
        automatically after the round is finalized.
      </>
    ),
  },
  {
    q: '💸 What are the platform fees and what are they for?',
    a: (
      <>
        A <b>5%</b> platform fee is taken from the pot at close. That fee is split <b>60%</b> to <b>$BCAT</b>{' '}
        stakers (when live) and <b>40%</b> to the treasury. See the Contracts section and BaseScan for verification.
      </>
    ),
  },
  {
    q: '🐾 What is $BCAT staking and how will it work?',
    a: (
      <>
        <b>$BCAT</b> staking (coming soon) will let holders lock BCAT to earn a share of platform fees
        (paid in $TOSHI) and unlock future club perks/governance. Until staking is live, the fee share is routed to the treasury.
      </>
    ),
  },
  {
    q: '🔍 How are winners selected?',
    a: (
      <>
        We use a commit–reveal seed from the operator combined with the last block hash at close. Selection is{' '}
        <b>ticket-weighted</b> and produces <b>5 unique winners</b>. You can verify the seed hash, reveal, and transfers on-chain.
      </>
    ),
  },
];

export default function FAQ() {
  const [open, setOpen] = React.useState<number | null>(null);

  function toggle(i: number) {
    setOpen(prev => (prev === i ? null : i));
  }

  return (
    <div className="card neon-border" id="faq">
      <div className="title-xl" style={{ fontSize: 24, marginBottom: 8 }}>
        FAQ
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {ITEMS.map((it, i) => {
          const isOpen = open === i;
          return (
            <div
              key={i}
              style={{
                border: '1px solid rgba(43,208,255,.12)',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'rgba(255,255,255,.03)',
              }}
            >
              <button
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="row"
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <span style={{ fontWeight: 600, textAlign: 'left' }}>{it.q}</span>
                <span
                  aria-hidden
                  style={{
                    transition: 'transform .18s cubic-bezier(.22,1,.36,1)',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    opacity: 0.9,
                  }}
                >
                  ▶
                </span>
              </button>

              {/* Answer panel */}
              <div
                style={{
                  maxHeight: isOpen ? 400 : 0,
                  transition: 'max-height .22s cubic-bezier(.22,1,.36,1)',
                  overflow: 'hidden',
                }}
              >
                <div className="muted" style={{ padding: '0 12px 12px 12px', lineHeight: 1.45 }}>
                  {it.a}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
