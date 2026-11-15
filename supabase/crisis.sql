-- Run once in the Supabase SQL editor for the SLOMUN crisis app.
-- The whole game is one JSON document. Only the server (service role key) reads or writes it;
-- row level security is on with no policies, so the public anon key cannot touch it.
create table if not exists public.crisis_state (
  id text primary key,
  version integer not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.crisis_state enable row level security;
