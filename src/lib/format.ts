import { useEffect, useRef, useState } from 'react';
export function formatToken(raw: bigint, decimals = 18, maxFrac = 2){
  const base = 10n ** BigInt(decimals);
  const whole = raw / base; const frac = raw % base;
  if (maxFrac === 0) return whole.toString();
  const fracStr = (base + frac).toString().slice(1).padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/,'');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
export function useCountUp(value: bigint, durationMs = 800){
  const [shown, setShown] = useState<bigint>(value); const prev = useRef<bigint>(value);
  useEffect(()=>{ const start = performance.now(); const from = prev.current; const to = value; if (from === to) return;
    function tick(t:number){ const k = Math.min(1, (t - start)/durationMs); const cur = from + ( (to - from) * BigInt(Math.floor(k*1000)) / 1000n ); setShown(cur); if (k < 1) requestAnimationFrame(tick); else prev.current = to; }
    requestAnimationFrame(tick);
  }, [value, durationMs]);
  return shown;
}
