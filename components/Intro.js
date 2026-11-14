'use client';

import { useEffect, useState } from 'react';

// Loader shown on first visit: crest + wordmark + loading bar, then the panel
// lifts and the hero content rolls in (see .roll rules in globals.css).
export default function Intro() {
  const [phase, setPhase] = useState('show');

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro === 'done') {
      setPhase('gone');
      return;
    }
    document.body.style.overflow = 'hidden';
    const t1 = setTimeout(() => setPhase('lift'), 1700);
    const t2 = setTimeout(() => {
      root.dataset.intro = 'done';
      try {
        sessionStorage.setItem('slomun-intro', '1');
      } catch (e) {}
      document.body.style.overflow = '';
    }, 2300);
    const t3 = setTimeout(() => setPhase('gone'), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      document.body.style.overflow = '';
    };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div className={`intro${phase === 'lift' ? ' intro-lift' : ''}`} aria-hidden="true">
      <img className="intro-crest" src="/images/crest.png" alt="" />
      <div className="intro-word">SLOMUN</div>
      <div className="intro-session">The Second Session</div>
      <div className="intro-track">
        <div className="intro-bar" />
      </div>
    </div>
  );
}
