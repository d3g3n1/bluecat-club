import React from 'react';
import { publicClient, walletClient, account$ } from '../lib/eth';
import { RAFFLE_ABI } from '../abi/BlueCatRaffle';
import { ERC20_ABI } from '../abi/erc20';
import { RAFFLE_ADDRESS, TOSHI_ADDRESS } from '../config/addresses';
import { toast } from '../lib/ui';

function fmtCommas(n:number){ return n.toLocaleString('en-US'); }
function fromWei(b: bigint){ return Number(b / 10n**18n); }

export default function RafflePanel(){
  const [roundId, setRoundId] = React.useState(0);
  const [potWei, setPotWei] = React.useState<bigint>(0n);
  const [ticketPriceWei, setTicketPriceWei] = React.useState<bigint>(0n);
  const [qty, setQty] = React.useState<number>(1);
  const [approved, setApproved] = React.useState<boolean>(false);
  const [account, setAccount] = React.useState<string|undefined>(undefined);

  React.useEffect(()=>{
    const sub = account$.subscribe(a=> setAccount(a || undefined));
    return () => sub.unsubscribe?.();
  },[]);

  async function load(){
    try{
      const cr = await publicClient.readContract({ address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'currentRound' }) as any;
      // cr: (id, openAt, closeAt, pot, closed, drawn)
      setRoundId(Number(cr[0]||0));
      setPotWei(cr[3] as bigint);

      const tp = await publicClient.readContract({ address: RAFFLE_ADDRESS, abi: RAFFLE_ABI, functionName: 'ticketPrice' }) as bigint;
      setTicketPriceWei(tp);

      if(account){
        const allowance = await publicClient.readContract({
          address: TOSHI_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [account as `0x${string}`, RAFFLE_ADDRESS]
        }) as bigint;
        setApproved(allowance >= tp * BigInt(Math.max(1, qty)));
      }
    }catch(e){ /* ignore */ }
  }
  React.useEffect(()=>{ load(); const id=setInterval(load,8000); return ()=>clearInterval(id); },[account, qty]);

  async function doApprove(){
    if(!account){ toast('Connect your wallet first'); return; }
    const amount = ticketPriceWei * BigInt(Math.max(10, qty*10)); // approve a bit more
    const hash = await walletClient.writeContract({
      address: TOSHI_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [RAFFLE_ADDRESS, amount]
    });
    toast('Approval sent', hash as string);
  }

  async function buy(){
    if(!account){ toast('Connect your wallet first'); return; }
    const hash = await walletClient.writeContract({
      address: RAFFLE_ADDRESS,
      abi: RAFFLE_ABI,
      functionName: 'buyTickets',
      args: [qty]
    });
    toast('Buy submitted', hash as string);
  }

  const ticketLabel = fmtCommas(fromWei(ticketPriceWei)) + ' $TOSHI';
  const potLabel = fmtCommas(fromWei(potWei)) + ' $TOSHI';

  return (
    <div id='raffle' className='card neon-border'>
      <div className='title-xl' style={{fontSize:24, marginBottom:8}}>BlueCat Lottery</div>
      <div className='row' style={{flexWrap:'wrap', gap:12}}>
        <div className='pill'>Ticket: {ticketLabel}</div>
        <div className='pill'>Round: {roundId}</div>
        <div className='pill'>Pot: {potLabel}</div>
      </div>

      <div style={{height:16}}/>

      <div className='row' style={{gap:12, alignItems:'center'}}>
        {!approved ? (
          <button className='pill cta' onClick={doApprove}>Approve TOSHI</button>
        ) : (
          <button className='pill disabled' disabled>Approved</button>
        )}
        <input className='input' type='number' min={1} value={qty} onChange={e=>setQty(Math.max(1, Number(e.target.value||1)))} style={{width:160}}/>
        <div className='row'>
          {[1,5,10,25].map(n=> (
            <button key={n} className='pill' onClick={()=>setQty(n)}>{n}</button>
          ))}
        </div>
        <button className='pill cta-ghost' onClick={buy}>Buy Tickets</button>
      </div>

      <div style={{height:10}}/>
      <small className='muted'>Approve once, then buy anytime before cut-off.</small>
    </div>
  );
}
