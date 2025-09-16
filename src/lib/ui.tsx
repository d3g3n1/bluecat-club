import React from 'react';

let setToasts: React.Dispatch<React.SetStateAction<JSX.Element[]>> | undefined;

/** Mount once near the app root. */
export function ToastHost(){
  const [items, set] = React.useState<JSX.Element[]>([]);
  setToasts = set;
  return (
    <div className='toast' style={{ display: items.length ? 'block' : 'none' }}>
      {items[0]}
    </div>
  );
}

export function toast(msg: string, txHash?: string){
  const view =
    typeof txHash === 'string'
      ? (<a href={`https://basescan.org/tx/${txHash}`} target='_blank' rel='noreferrer' className='pill' style={{ marginLeft: 8 }}>View</a>)
      : null;
  const node = <div>{msg}{view}</div>;
  setToasts?.([node]);
  setTimeout(() => setToasts?.([]), 5000);
}
