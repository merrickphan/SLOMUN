# SLOMUN Crisis App

The live crisis app for the Early WWII committee. It lives at `/crisis` on the website and is hidden from search engines. Every screen needs an access code.

## Screens

| URL | Who | What it shows |
|---|---|---|
| `/crisis` | Everyone | Code login |
| `/crisis/map` | Projector (and staff) | The public 3D map: what the whole room knows, the crisis update, the directive on the floor, the news wire and breaking news flashes |
| `/crisis/delegate` | Each delegate | Their own map with fog of war, plus the Actions, Directives, Portfolio, Intel and Requests tabs |
| `/crisis/staff` | Crisis staff and chair | The request queue, chair controls for directives, crisis update publisher, projector controls, access codes and game reset |

Screens refresh about every 1.5 seconds. Moves that staff approve glide across the map on every screen that can see them.

## How it fits together

- `lib/crisis/scenario.js` holds the starting forces, treasuries, generals, portfolios and rules. **Edit this file to change starting numbers.**
- `lib/crisis/engine.js` holds the game rules. Every change goes through `applyAction`, and every screen reads through `viewFor`, which hides private information:
  - the projector gets public positions only;
  - delegates get only their own requests, intel and agents, and only the units their side can see;
  - staff get everything.
- `lib/crisis/store.js` saves the game: Supabase when configured, otherwise server memory.
- `lib/crisis/auth.js` handles access codes and signed login cookies.
- `components/crisis/app.js` holds the browser side: the globe, figurines and screens.

## Setup before the conference

1. **Create a free Supabase project** at supabase.com.
2. In Supabase, open **SQL Editor**, paste in `supabase/crisis.sql` and run it.
3. In Vercel, open **Project, Settings, Environment Variables** and add:
   - `SUPABASE_URL`: from Supabase, Project Settings, API.
   - `SUPABASE_SERVICE_ROLE_KEY`: the **service_role** key, which is secret. Never put it in the browser or in git.
   - `CRISIS_SECRET`: a long random string of at least 16 characters. **Changing it changes every delegate code.**
   - `CRISIS_STAFF_CODE`: the staff login code, for example `STAFF-` plus 6 random digits.
   - `CRISIS_PROJECTOR_CODE`: the projector login code.
4. Redeploy. The staff screen's **Game** panel should say "Supabase database".
5. On the staff screen, print the **Access codes** table and cut it into one card per delegate.

Without Supabase the game lives in server memory. That's fine for trying it out, but on Vercel it can reset at any time, so **connect Supabase before any real session.**

## Local testing

```bash
npm run dev
```

Then open `http://localhost:3000/crisis`. In development the codes are `STAFF-000000` (staff) and `MAP-000000` (projector). Delegate codes are listed on the staff screen.

## On the day

- Run a test session with your crisis staff a week before.
- Use **Reset the whole game** (type RESET) right before the committee starts.
- **Load demo requests** fills the queue with examples for practice. Don't use it during the real session.
- Keep paper directive forms and crisis note slips in the room in case the Wi-Fi fails.
