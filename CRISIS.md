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

## Map arrows

- Approving a move draws an arrow from the unit's old position to its new one, in the moving country's color.
- A secret move draws a **dashed** arrow that only that side's laptops see. Revealing the move turns it solid on the projector.
- Arrows fade one crisis update after they appear.
- **Clear all arrows** on the staff screen removes every arrow at once.
- Arrows are only drawn over the detailed Europe map, not the Pacific.

## Testing plan

### 1. Solo test (about 15 minutes, one computer)
Use separate browser profiles or incognito windows, since each login is a cookie:
- Window 1: staff (`/crisis`, staff code).
- Window 2: projector (projector code).
- Window 3: a delegate, with a code from the staff screen's Access codes table.
- Your phone: a second delegate from the other side, for example Rommel versus Cunningham.

Then run through this checklist:
- [ ] Delegate moves a unit, sends a spy, sends money, and writes a press release.
- [ ] Staff sees each one appear within about 2 seconds.
- [ ] Approve a move **on projector**: the unit glides and a solid arrow appears on the projector.
- [ ] Approve a move **secretly**: the projector shows nothing; the delegate sees the move and a dashed arrow; **Reveal on projector** makes it visible.
- [ ] Spy **Succeeds** puts a report in the delegate's Intel tab. Spy **Caught** puts an arrest headline on the news wire.
- [ ] Money and builds change treasuries in the top bar.
- [ ] Directive: one delegate writes it and asks 3 others, they sign, the sponsor submits, the chair puts it on the floor (it appears on the projector), and the chair records the vote.
- [ ] Publish a crisis update with a flash: the newspaper pops up on the projector and the countdown restarts.
- [ ] The other side's delegate cannot see the first delegate's requests, intel or secret moves.
- [ ] Reload every window: everything is still there, which shows Supabase is saving.
- [ ] Type RESET and reset the game.

### 2. Staff rehearsal (30 to 45 minutes, about 4 to 6 people)
Crisis director, 2 to 3 backroom staff, the chair, plus 2 or 3 friends playing delegates. Run one full cycle: opening update, 15 minutes of requests, a directive vote, Crisis Update 2. Decide in advance:
- who handles which countries' requests (use the country filter);
- how fast replies should go out (aim for under 5 minutes);
- who writes and publishes crisis updates.

### 3. Device and Wi-Fi check (at the school, a week before)
- [ ] Open a delegate laptop on a **school Chromebook**. The 3D map should be usable. If it is slow, close other tabs.
- [ ] Log 10 or more devices into the school Wi-Fi at once and check the "Live" dot stays green.
- [ ] Projector laptop plus classroom projector: check that **Full screen** works and text is readable from the back row.
- [ ] Check the school network does not block `*.vercel.app` or `slomun.com`.

### 4. Full dress rehearsal (1 to 2 weeks before April 3)
Fill as many of the 22 seats as possible with volunteers and run 45 to 60 minutes exactly as on the day. Keep paper directive forms and note slips ready, and practice switching to paper for 5 minutes as a Wi-Fi-failure drill.

### On the morning
1. Reset the game (type RESET).
2. Print and cut the access code cards.
3. Open the staff screen and the projector before delegates arrive.

## Starting forces and sources

Strength units:
- **Armies and armor:** divisions. Soviet and Polish armor counts brigades.
- **Fleets:** capital ships (battleships, battlecruisers, pocket battleships and aircraft carriers).
- **Air forces:** hundreds of front-line aircraft.

The figures in `lib/crisis/scenario.js` come from these sources:

| Force | Figure | Source |
|---|---|---|
| German Army Groups North and South, panzer and light divisions | 18 / 24 / 10 divisions | [ww2-weapons.com: German orders of battle, 1 September 1939](https://ww2-weapons.com/german-orders-of-battle-for-september-1-1939) |
| Luftwaffe | about 1,000 fighters and 1,050 bombers | Britannica, "Forces and resources of the European combatants, 1939" |
| Polish armies, motorized brigades, air force | per-army divisions; 2 motorized brigades; about 400 aircraft | [Wikipedia: Polish army order of battle in 1939](https://en.wikipedia.org/wiki/Polish_army_order_of_battle_in_1939); [historyofwar.org](https://www.historyofwar.org/articles/campaign_poland_1939_2.html) |
| French Northeast Front | about 85 divisions | [Axis History Forum](https://forum.axishistory.com/viewtopic.php?p=1426272) (sources differ) |
| Army of the Alps | about 175,000 men | [Wikipedia: Army of the Alps (France)](https://en.wikipedia.org/wiki/Army_of_the_Alps_(France)) |
| Armée de l'Air | 634 fighters, 463 bombers | [Britannica: French Air Force](https://www.britannica.com/topic/French-Air-Force) |
| RAF | 1,911 first-line aircraft | [Official history, RAF 1939–1945 Vol. I](https://ibiblio.org/hyperwar/UN/UK/UK-RAF-I/UK-RAF-I-V.html) |
| Royal Navy | 15 battleships and battlecruisers, 7 carriers | [Naval History Net](https://www.naval-history.net/WW2CampaignRoyalNavy.htm) |
| Italian army and air force | 73 divisions judged feasible; 1,190 of 2,586 aircraft operational | [Military history of Italy during WWII](https://en.wikipedia.org/wiki/Military_history_of_Italy_during_World_War_II); [militaryhistoryvisualized.com](https://militaryhistoryvisualized.com/tag/1939) |
| Soviet invasion force | 33+ divisions, 9 tank brigades, about 3,300 aircraft | [Soviet order of battle for the invasion of Poland](https://www.wikiwand.com/en/articles/Soviet_order_of_battle_for_invasion_of_Poland_in_1939) |
| US Battle Force, Army Air Corps | 12 battleships and 5 carriers; about 800 first-line aircraft | [Wikipedia: Battle Fleet](https://en.wikipedia.org/wiki/Battle_Fleet); [Air & Space Forces Magazine](https://www.airandspaceforces.com/article/1007wwii/) |
| Kwantung Army, China Expeditionary Army | 6 divisions; 23 divisions and 28 brigades | [weaponsandwarfare.com](https://weaponsandwarfare.com/?p=6652) |

**Still estimates.** Each of these units has a staff note on the staff screen:
- German Army Group C
- the split of British ships between the Home and Mediterranean fleets
- the Regia Marina
- the split of Soviet divisions between districts
- the US Atlantic Squadron
- Japan's Combined Fleet and Naval Air Service
- Finland

Treasuries are still placeholders.
