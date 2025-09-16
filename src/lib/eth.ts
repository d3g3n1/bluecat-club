// src/lib/eth.ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
  Address,
} from 'viem';
import { base } from 'viem/chains';
import { ERC20_ABI } from '../abi/erc20';
import { RPC_URL } from '../config/addresses';

/* ---------------- Provider selection ---------------- */

let selectedProvider: any | undefined;

function detectProviders(): any[] {
  const uniq = new Set<any>();
  const add = (p: any) => { if (p) uniq.add(p); };

  const eth: any = (window as any).ethereum;
  if (eth?.providers?.length) eth.providers.forEach(add);
  add(eth);

  const phantomEth: any = (window as any).phantom?.ethereum;
  if (phantomEth) { try { phantomEth.isPhantom = true; } catch {} add(phantomEth); }
  if (eth?.isPhantom) add(eth);

  return Array.from(uniq);
}

function pickProvider(kind: 'metamask' | 'phantom' | 'coinbase'): any | undefined {
  const list = detectProviders();
  if (kind === 'metamask') {
    return list.find(p => p?.isMetaMask) ||
           list.find(p => p && !p.isCoinbaseWallet && !p.isPhantom);
  }
  if (kind === 'coinbase') return list.find(p => p?.isCoinbaseWallet);
  if (kind === 'phantom')  return list.find(p => p?.isPhantom) || (window as any).phantom?.ethereum;
  return undefined;
}

export function useWallet(kind: 'metamask' | 'phantom' | 'coinbase') {
  const p = pickProvider(kind);
  if (!p) throw new Error(`${kind} not found. If Phantom: enable EVM support in Phantom settings.`);
  selectedProvider = p;
  (window as any).__bluecatProvider = p; // debug
}

export function getProvider(): any | undefined {
  return selectedProvider || (window as any).ethereum;
}

/* ---------------- viem clients ---------------- */

export const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
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
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ['https://basescan.org'],
        }],
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
    } else if (e?.code !== -32601) { // -32601: method not supported → ignore
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

/* ------------- Convenience: connect the chosen wallet ------------- */
/** Call this from your wallet picker button. */
export async function connectWith(kind: 'metamask' | 'phantom' | 'coinbase') {
  useWallet(kind);        // 1) set provider
  // Some wallets prefer accounts first, then switch; do both safely:
  const accs = await requestAccounts(); // 2) open correct wallet
  try { await switchToBase(); } catch {}
  return accs;
}

/* Optional debug */
export function debugProviders() {
  const list = detectProviders();
  console.log('Detected providers:', list.map(p => ({
    isMetaMask: !!p?.isMetaMask, isCoinbaseWallet: !!p?.isCoinbaseWallet, isPhantom: !!p?.isPhantom
  })));
  return list;
}
