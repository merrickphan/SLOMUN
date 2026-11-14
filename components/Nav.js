'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { aboutLinks, slomunLinks } from '@/lib/site';

function Chevron() {
  return (
    <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dropdown({ label, items, active }) {
  return (
    <li className={`nav-item has-menu${active ? ' active' : ''}`}>
      <button type="button" className="nav-link" aria-haspopup="true">
        {label} <Chevron />
      </button>
      <ul className="menu">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href}>{i.label}</Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const home = path === '/';

  useEffect(() => setOpen(false), [path]);

  const inSlomun = slomunLinks.some((l) => l.href === path) && path !== '/committees' && path !== '/register';

  return (
    <header id="top" className={`nav${home ? ' nav-transparent roll roll-nav' : ''}${open ? ' nav-open' : ''}`}>
      <Link href="/" className="brand" aria-label="SLOMUN home">
        <img src="/images/crest.png" alt="" width="64" height="55" />
        <span>
          <strong>SLOMUN</strong>
          <small>San Luis Obispo Model UN</small>
        </span>
      </Link>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen(!open)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav aria-label="Main">
        <ul className="nav-list">
          <Dropdown label="About" items={aboutLinks} active={path === '/about'} />
          <Dropdown label="SLOMUN" items={slomunLinks} active={inSlomun} />
          <li className={`nav-item${path === '/committees' ? ' active' : ''}`}>
            <Link className="nav-link" href="/committees">Committees</Link>
          </li>
          <li className={`nav-item${path === '/register' ? ' active' : ''}`}>
            <Link className="nav-link" href="/register">Register</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
