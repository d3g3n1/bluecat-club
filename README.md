# BlueCat Club — Daily $TOSHI Raffle on Base

A minimal, fast dApp built with **Vite + React + viem**.

- 🎟 **Daily $TOSHI raffle** on Base (weighted by tickets, 5 unique winners)
- 🔐 **Commit–reveal** randomness: server seed (commit at open → reveal at finalize) + last blockhash
- 💸 **Platform fee:** **5%** of the pot (split **60%** to **$BCAT stakers** when live, **40%** to treasury)
- 🐾 **$BCAT staking:** *Coming soon* (UI present; staking contract not yet live)

---

## Live Contracts (Base mainnet)

| Contract | Address |
|---|---|
| **Raffle** | `0xA2974Be72E0EbD66a2368e8734b64941290CC1Ad` |
| **$TOSHI token** | `0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4` |
| **$BCAT token** | `0x681e0a28637e9f9a70fb9fc6424489d8c8cb8453` |
| **Staking (BCAT)** | *Coming soon* |

> **Ticket price:** 10,000 TOSHI (18 decimals).  
> **Winners:** 5 unique wallets (no repeats).  
> **Payout tiers:** **45% / 25% / 15% / 10% / 5%**.

---

## Quickstart (Local Dev)

**Requirements:** Node 18+ (Node 20 recommended) and npm.

```bash
npm install
npm run dev
