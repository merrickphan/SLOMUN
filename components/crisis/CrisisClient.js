'use client';
import { useEffect, useRef } from 'react';

// Thin React shell. The crisis screens are drawn by an imperative module (3D globe plus
// panels) that loads only in the browser.
export default function CrisisClient(props) {
  const ref = useRef(null);
  useEffect(() => {
    let stop;
    import('./app').then((m) => { stop = m.start(ref.current, props); });
    return () => stop?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className="crisis-root"><p style={{ padding: 24, color: '#9AA3B2' }}>Loading the crisis room…</p></div>;
}
