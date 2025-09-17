// src/components/RaffleCard.tsx
import React from 'react';
import { publicClient, getWalletClient } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { ERC20_ABI } from '../abi/erc20';
import { RAFFLE_ADDRESS, TOSHI_ADDRESS } from '../config/addresses';
import { formatToken } from '../lib/format';
import { toast } from '../lib/ui';

type RoundView = {
  id: bigint;
  openAt: bigint;
  closeAt: bigint;
  pot: bigint;
  closed: boolean;
  drawn: boolean;
};

function fmtWhole18(wei: bigint) {
  const whole = wei / (10n ** 18n);
  return Number(whole).toLocaleString(); // e.g., 10,000
}

export default function RaffleCard({ address }: { address: string }) {
  const [ticketPrice, setTicketPrice] = React.useState<bigint>(0n);
  const [round, setRound] = React.useState<RoundView | null>(null);
  const [myTickets, setMyTickets] = React.useState<bigint>(0n);
  const [count, setCount] = React.useState('1');
  const [allowance, setAllowance] = React.useState<bigint>(0n);
  const [busy, setBusy] = React.useState(false);

  const needAmount = (() => {
    const n = BigInt(count || '0');
    return n > 0n ? ticketPrice * n : 0n;
  })();

  async function load() {
    try {
      const tp = (await publicClient.readContract({
        address: RAFFLE_ADDRESS,
        abi: RAFFLE_ABI,
        functionName: 'ticketPrice',
      })) as bigint;

      const [id, openAt, closeAt, pot, closed, drawn] = (await publicClient.readContract({
        address: RAFFLE_ADDRESS,
        abi: RAFFLE_ABI,
        functionName: 'currentRound',
      })) as any;

      setTicketPrice(tp);
      setRound({ id, openAt, closeAt, pot, closed, drawn });

      if (address && id) {
        const [t, alw] = (await Promise.all([
          publicClient.readContract({
            address: RAFFLE_ADDRESS,
            abi: RAFFLE_ABI,
            functionName: 'getUserTickets',
            args: [id as bigint, address as `0x${string}`],
          }),
          publicClient.readContract({
            address: TOSHI_ADDRESS,
            abi: ERC20_ABI as any,
            functionName: 'allowance',
            args: [address as `0x${string}`, RAFFLE_ADDRESS],
          }),
        ])) as [bigint, bigint];

        setMyTickets(t);
        setAllowance(alw);
      } else {
        setMyTickets(0n);
        setAllowance(0n);
      }
    } catch {
      // ignore transient read errors during polling
    }
  }

  React.useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function buyOneClick() {
    setBusy(true);
    try {
      const n = BigInt(count || '0');
      if (n <= 0n) { toast('Enter ticket count'); setBusy(false); return; }
      if (!address) { toast('Connect wallet'); setBusy(false); return; }
      if (!round || round.closed) { toast('Round is closed'); setBusy(false); return; }

      const cost = ticketPrice * n;

      // ✅ signer
      const client = await getWalletClient();
      let [account] = await client.getAddresses();
      if (!account) {
        const eth = (window as any).ethereum;
        const [a] = await eth.request({ method: 'eth_requestAccounts' });
        account = a as `0x${string}`;
      }
      if (!account) { toast('Connect wallet'); setBusy(false); return; }

      // 1) Approve EXACT amount if needed (direct send = most reliable)
      if (cost > allowance) {
        const txA = await client.writeContract({
          account,
          address: TOSHI_ADDRESS,
          abi: ERC20_ABI as any,
          functionName: 'approve',
          args: [RAFFLE_ADDRESS, cost],
        });
        toast(`Approving ${fmtWhole18(cost)} TOSHI…`, txA);
        setAllowance(cost); // optimistic; load() will refresh later
      }

      // 2) Buy
      const txB = await client.writeContract({
        account,
        address: RAFFLE_ADDRESS,
        abi: RAFFLE_ABI as any,
        functionName: 'buyTickets',
        args: [n],
      });
      toast(`Purchased ${n.toString()} ticket(s)`, txB);

      setTimeout(load, 2500);
    } catch (e: any) {
      toast(e?.shortMessage || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className='title-xl' style={{ fontSize: 22, marginBottom: 8 }}>
        Daily $TOSHI Raffle
      </div>

      <div className='row' style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div className='chip'>Ticket: {fmtWhole18(ticketPrice)} $TOSHI</div>
        <div className='chip'>Round: {round ? String(round.id) : '—'}</div>
        <div className='chip'>Pot: {round ? formatToken(round.pot) : '—'} $TOSHI</div>
        <div className='chip'>My Tickets: {round ? String(myTickets) : '—'}</div>
      </div>

      <div className='row' style={{ gap: 10, alignItems: 'center' }}>
        <input
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder='Tickets'
        />
        <div className='row' style={{ gap: 8 }}>
          {[1, 5, 10, 25].map((n) => (
            <button key={n} className='qtychip' onClick={() => setCount(String(n))}>
              {n}
            </button>
          ))}
        </div>
        <button className='pill cta' onClick={buyOneClick} disabled={busy || !address}>
          Buy Tickets
        </button>
      </div>

      <div className='muted' style={{ marginTop: 8 }}>
        Payouts: <b>45%</b> / <b>25%</b> / <b>15%</b> / <b>10%</b> / <b>5%</b> to 5 unique winners.
      </div>
    </div>
  );
}
