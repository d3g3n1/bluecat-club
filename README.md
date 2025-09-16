
# BlueCat Club — TOSHI Lottery + TOSHI Staking Vault

Minimal Vite + React + viem dApp with automation scripts.

## Quickstart
1. Copy `.env.example` → `.env` and keep addresses as-is (or update).
2. Create `.env.admin` with your owner private key:
   ```
   ADMIN_PRIVATE_KEY=0xYOUR_OWNER_PRIVATE_KEY
   RPC_URL=https://mainnet.base.org
   RAFFLE_ADDRESS=0x9D8de4162f4928d88027AFB67F51178D4Eb6C3Bc
   ```
3. Install & run:
   ```bash
   npm i
   npm run dev
   ```

## Automation
- Open round: `npm run open-daily`
- Settle: `npm run settle-now`
