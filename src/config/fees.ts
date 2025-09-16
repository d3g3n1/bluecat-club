// src/config/fees.ts
const n = (v: any, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

export const DEFAULT_FEE_BPS =
  n(import.meta.env.VITE_FEE_BPS, 500);                 // 5.00%
export const DEFAULT_FEE_STAKERS_BPS =
  n(import.meta.env.VITE_FEE_STAKERS_BPS, 6000);        // 60%
export const DEFAULT_FEE_TREASURY_BPS =
  n(import.meta.env.VITE_FEE_TREASURY_BPS, 4000);       // 40%
