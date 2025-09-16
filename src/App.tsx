// src/App.tsx
import React from 'react';

import Header from './components/Header';
import Hero from './components/Hero';

import RaffleCard from './components/RaffleCard';
import StakeCard from './components/StakeCard';

import HowItWorks from './components/HowItWorks';
import HowStakingWorks from './components/HowStakingWorks';
import Winners from './components/Winners';

import BCATCard from './components/BCATCard';
import Community from './components/Community';
import Contracts from './components/Contracts';
import FAQ from './components/FAQ';
import Footer from './components/Footer';

import { ToastHost } from './lib/ui';

export default function App() {
  const [address, setAddress] = React.useState<string>('');

  return (
    <div className="wrap">
      <Header onConnect={setAddress} />

      <div className="glass hero">
        <Hero />
      </div>

      <div style={{ height: 18 }} />

      <div className="grid">
        <div className="card neon-border" id="raffle">
          <RaffleCard address={address} />
        </div>
        <div className="card neon-border" id="stake">
          <StakeCard address={address} />
        </div>
      </div>

      <div style={{ height: 18 }} />
      <HowItWorks />

      <div style={{ height: 18 }} />
      <HowStakingWorks />

      <div style={{ height: 18 }} />
      <Winners />

      <div style={{ height: 18 }} />
      <BCATCard />

      <div style={{ height: 18 }} />
      <Community />

      <div style={{ height: 18 }} />
      <Contracts />

      <div style={{ height: 18 }} />
      <FAQ />

      <div className="divider" />
      <Footer />

      <ToastHost />
    </div>
  );
}
