'use client';
import { useState } from 'react';

export default function Login() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/crisis/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'That code did not work.'); setBusy(false); return; }
      window.location.href = j.go;
    } catch { setErr('Could not reach the server. Check the Wi-Fi and try again.'); setBusy(false); }
  }
  return (
    <main className="login">
      <form onSubmit={submit}>
        <img src="/images/crest.png" alt="SLOMUN crest" />
        <h1>Early WWII Crisis</h1>
        <p>Enter the access code on your placard card. Crisis staff hand these out at the start of the session.</p>
        <label htmlFor="code" className="sr" style={{ fontSize: 12, color: '#9AA3B2', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Access code</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" placeholder="SURNAME-123456" required />
        {err && <div className="err" role="alert">{err}</div>}
        <button className="send" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Enter'}</button>
      </form>
    </main>
  );
}
