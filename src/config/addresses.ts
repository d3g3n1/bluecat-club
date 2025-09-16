// src/config/addresses.ts
export const ZERO = '0x0000000000000000000000000000000000000000' as const;

function asAddr(v?: string) {
  const s = (v || '').trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) ? (s as `0x${string}`) : undefined;
}

// RPC — default to Base mainnet if not provided
export const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string) || 'https://mainnet.base.org';

// Addresses from env (fall back to ZERO instead of throwing)
export const RAFFLE_ADDRESS = asAddr(import.meta.env.VITE_RAFFLE_ADDRESS) || ZERO;
export const VAULT_ADDRESS  = asAddr(import.meta.env.VITE_VAULT_ADDRESS)  || ZERO;
export const TOSHI_ADDRESS  = asAddr(import.meta.env.VITE_TOSHI_ADDRESS)  || ZERO;
export const BCAT_ADDRESS   = asAddr(import.meta.env.VITE_BCAT_ADDRESS)   || ZERO;

// Optional convenience flags (useful for conditional UI)
export const HAS = {
  RAFFLE: RAFFLE_ADDRESS !== ZERO,
  VAULT:  VAULT_ADDRESS  !== ZERO,
  TOSHI:  TOSHI_ADDRESS  !== ZERO,
  BCAT:   BCAT_ADDRESS   !== ZERO,
} as const;
