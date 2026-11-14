'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

// Forms are designed but not wired to a backend yet. Submitting shows a notice
// instead of pretending the message was sent.
export default function PlaceholderForm({ rows, textarea, submit, notice }) {
  const [sent, setSent] = useState(false);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      {rows.map((row, i) => (
        <div className="form-row" key={i}>
          {row.map(([label, placeholder, type = 'text']) => (
            <label className="field" key={label}>
              <span>{label}</span>
              <input type={type} placeholder={placeholder} name={label} />
            </label>
          ))}
        </div>
      ))}
      {textarea && (
        <label className="field">
          <span>{textarea[0]}</span>
          <textarea rows={5} placeholder={textarea[1]} name={textarea[0]} />
        </label>
      )}
      <div>
        <Button type="submit">{submit}</Button>
      </div>
      {sent && <p className="notice">{notice}</p>}
    </form>
  );
}
