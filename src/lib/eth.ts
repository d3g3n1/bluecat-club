// src/lib/eth.ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  fallback,
  parseUnits,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { ERC20_ABI } from '../abi/erc20';
import { RPC_URL } from '../config/addresses';

/** One-time debug: make sure the built bundle is using your Alchemy URL. */
if (typeof window !== 'undefined') {
  // You should see https://base-mainnet.g.alchemy.com/v2/.... in the console.
  console.log('[BlueCat] RPC_URL in bundle:', RPC_URL);
}

/* ---------------- Provider selection ---------------- */

let selectedProvider: any | undefined;

function detectProviders(): any[] {
  const uniq = new Set<any>();
  const w = window as any;
  const eth = w.ethereum;
  const add = (p: any) => p && uniq.add(p);

  if (eth?.providers && Array.isArray(eth.providers)) eth.providers.forEach(add);
  add(eth); // single injected

  // Phantom EVM
  const phantomEth: any = w.phantom?.ethereum;
  if (phantomEth) {
    try { phantomEth.isPhantom = true; } catch {}
    add(phantomEth);
  }
  if (eth?.isPhantom) add(eth);

  return Array.from(uniq);
}

function pickProvider(kind: 'metamask' | 'phantom' | 'coinbase'): any | undefined {
  const list = detectProviders();
  if (kind === 'metamask') {
    return list.find(p => p?.isMetaMask)
        || list.find(p => p && !p.isCoinbaseWallet && !p.isPhantom);
  }
  if (kind === 'coinbase') return list.find(p => p?.isCoinbaseWallet);
  if (kind === 'phantom')  return list.find(p => p?.isPhantom) || (window as any).phantom?.ethereum;
  return undefined;
}

function getProvider(): any | undefined {
  return selectedProvider || (window as any).ethereum;
}

function useWallet(kind: 'metamask' | 'phantom' | 'coinbase') {
  const p = pickProvider(kind);
  if (!p) throw new Error(`${kind} not found. If Phantom: enable EVM support in Phantom settings.`);
  selectedProvider = p;
  (window as any).__bluecatProvider = p; // debug
}

/* ---------------- viem clients ---------------- */

// Prefer your Alchemy RPC; keep BlockPi as a quiet backup.
// Removed https://mainnet.base.org to stop 403 spam in browsers.
export const publicClient = createPublicClient({
  chain: base,
  transport: fallback(
    [
      http(RPC_URL, { batch: true }), // <— Alchemy from VITE_RPC_URL
      http('https://base.blockpi.network/v1/rpc/public', { batch: true }), // backup
    ],
    { rank: true } // prefer first; fail over if it hiccups
  ),
});

export async function getWalletClient() {
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not found. Install MetaMask/Phantom/Coinbase.');
  return createWalletClient({ chain: base, transport: custom(provider) });
}

/* ---------------- Helpers ---------------- */

export async function requestAccounts(): Promise<Address[]> {
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not found.');
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  return (accounts || []).map(a => a as Address);
}

/** Try to show account chooser; fall back to requestAccounts */
export async function requestAccountPermissions(): Promise<Address[]> {
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not found.');
  try {
    await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // some wallets don’t implement this → ignore
  }
  return requestAccounts();
}

export async function switchToBase(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('Wallet not found.');
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
  } catch (e: any) {
    if (e?.code === 4902 || e?.data?.originalError?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [RPC_URL, 'https://base.blockpi.network/v1/rpc/public'],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
    } else if (e?.code !== -32601) {
      throw e;
    }
  }
}

export function subscribeToWalletChanges(
  onAccounts?: (accs: Address[]) => void,
  onChain?: (hex: string) => void,
) {
  const provider = getProvider();
  if (!provider || !provider.on) return () => {};
  const accHandler = (accs: string[]) => onAccounts?.((accs || []).map(a => a as Address));
  const chainHandler = (hex: string) => onChain?.(hex);
  provider.on('accountsChanged', accHandler);
  provider.on('chainChanged', chainHandler);
  return () => {
    provider.removeListener?.('accountsChanged', accHandler);
    provider.removeListener?.('chainChanged', chainHandler);
  };
}

export function toWei(amount: string | number, decimals = 18) {
  return parseUnits(String(amount || 0), decimals);
}

export async function getTokenBalance(address: Address, token: Address) {
  const [decimals, bal] = await Promise.all([
    publicClient.readContract({ address: token, abi: ERC20_ABI as any, functionName: 'decimals' }) as Promise<number>,
    publicClient.readContract({ address: token, abi: ERC20_ABI as any, functionName: 'balanceOf', args: [address] }) as Promise<bigint>,
  ]);
  const formatted = Number(bal) / 10 ** decimals;
  return { raw: bal, decimals, formatted };
}

export async function getAllowance(owner: Address, spender: Address, token: Address) {
  const alw = (await publicClient.readContract({
    address: token, abi: ERC20_ABI as any, functionName: 'allowance', args: [owner, spender],
  })) as bigint;
  return alw;
}

/* ------------- Entry points ------------- */

export async function connectWith(kind: 'metamask' | 'phantom' | 'coinbase') {
  useWallet(kind);
  const accs = await requestAccountPermissions(); // prompt selection if wallet supports it
  try { await switchToBase(); } catch {}
  return accs;
}

export async function hardDisconnect() {
  const provider = getProvider();
  try { await provider?.disconnect?.(); } catch {}
  try {
    await provider?.request?.({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {}
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('wc@') || k.includes('walletconnect')) localStorage.removeItem(k);
      if (k.includes('wagmi.store')) localStorage.removeItem(k);
      if (k.includes('coinbaseWalletSDK')) localStorage.removeItem(k);
    }
  } catch {}
  selectedProvider = undefined;
}

/* Optional debug */
export function debugProviders() {
  const list = detectProviders();
  console.log('Detected providers:', list.map(p => ({
    isMetaMask: !!p?.isMetaMask, isCoinbaseWallet: !!p?.isCoinbaseWallet, isPhantom: !!p?.isPhantom
  })));
  return list;
}
