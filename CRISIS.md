# SLOMUN Crisis App

The live crisis app for the Early WWII committee. It lives at `/crisis` on the website and is hidden from search engines. Every screen needs an access code.

## Screens

| URL | Who | What it shows |
|---|---|---|
| `/crisis` | Everyone | Code login |
| `/crisis/map` | Projector (and staff) | The public 3D map: what the whole room knows, the crisis update, the directive on the floor, the news wire and breaking news flashes |
| `/crisis/delegate` | Each delegate | Their own map with fog of war, plus the Actions, Directives, Portfolio, Intel and Requests tabs |
| `/crisis/staff` | Crisis staff and chair | The staff map: true positions of everything, the request drawer, and click-to-edit for units, regions and map features. Tools along the top open pop-ups: directives, crisis update, make something happen, battle, wars and treaties, map features, messages, projector, access codes, game |

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

## Effects toolkit and free-form play

- **Crisis notes:** delegates can submit any feasible plan as a free-form note, with an optional budget and map location. **Follow up** on an answered request builds a chain of notes into a longer plan.
- **Messages:** delegates can send private messages to each other. Staff can read every message on the staff screen.
- **Effects:** when approving any request, or carrying out a passed directive, staff can attach effects:
  - change money or unit strength
  - destroy, move or create units
  - change who holds regions
  - send intel
  - post a headline
  - place a map marker
  - grant a delegate a new asset or power
  - message delegates as a character such as Hitler or Stalin
- **Make something happen:** applies the same effects at any time, for events nobody asked for.
- **Timing:** every set of effects can happen now, at the next crisis update, or 2 or 3 updates later. Scheduled effects are listed under **Map features and scheduled events**, where staff can cancel them.
- **Arrows:** movement arrows are turned off. Units still glide to their new positions.

## The crisis assistant

Staff no longer have to build effects by hand for most requests.

- **Delegates have four actions:** Crisis note, Move forces, Build forces and Send money. A crisis note covers everything else: attacks, spies, sabotage, propaganda, treaties, declarations of war. A **public** note works as a press release.
- **Every request shows "If approved" and "If rejected"** before staff decide: the effects, the headline and any breaking news. Drop any effect with ✕.
- **Approve or Reject is one click.** If staff write a reply that describes a different outcome ("the attack stalls at the Maginot Line"), the assistant re-reads the note with the reply and matches the effects to it.
- **Battles roll themselves.** An approved attack becomes a battle effect that uses the same table as the battle calculator, including map features and unit traits.
- **Passed directives** get the same preview and a **Carry out the directive** button.
- **Make something happen** takes a plain description and turns it into effects to check before applying.
- **Undo:** the last decision can be undone for 10 minutes from the bar at the top of the staff screen.
- **Headlines:** every approved public request, battle and directive reaches the news wire automatically. Wars, peace and alliances also show a breaking news flash on the projector and every delegate screen.
- **Wars, treaties and conditions:** delegate screens show a bar with who they are at war with, their allies and pacts, and their country's conditions (for example "Fuel rationing"). The game starts on 3 September 1939: Germany at war with Poland, Britain and France; the Pact of Steel; the Molotov-Ribbentrop Pact. Staff can change these under Map tools.

**Turning it on:** add `ANTHROPIC_API_KEY` in Vercel (Project, Settings, Environment Variables, marked sensitive) and redeploy. It uses Claude Opus 5.5. Without the key, the app falls back to keyword matching, which catches wars, peace, alliances, pacts and trade deals only. The Setup tab shows which mode is on.

**Staff screen:** the staff screen is the map.
- **Requests** sit in a drawer on the left. "Show on map" flies to the spot a delegate marked.
- **Click land:** give the region or its whole zone to anyone; spawn forces there (owner, type, strength, name, a quality bonus such as "Elite +1", public or secret, optional headline); build trenches, bunkers, factories and other features; or drop a labelled pin.
- **Click the sea:** spawn fleets or place features.
- **Click a unit:** change strength, add or remove traits, move it (public or secret), reveal it, destroy it, or mark it as an attacker or defender. Picked units collect in a battle bar at the bottom; "Work it out" opens the battle calculator with them filled in.
- **Click a map feature:** destroy, repair, finish or remove it.
- **Buttons along the top** open pop-ups: Directives, Crisis update, Make something happen, Battle, Wars and treaties, Map features, Messages, Projector, Access codes (printable) and Game (storage, assistant mode, demo, reset).
- The old `/crisis/map?edit=1` map editor now redirects here.

## Spies and notes

- **Notes:** the Notes tab lets delegates pass private notes to any other delegates. Crisis staff can read every note in the Messages pop-up.
- **Spies:** when a spy plan is approved, the assistant places an agent. Staff can also add one by hand with the "Place or remove a spy" effect. The sender sees the agent as a dark pin on their map, and it clears the fog around it so they can see nearby forces.
- **What spies see:** an agent reveals anything within about 2.5° of it, and its target country's forces within about 10°. Staff can also show one country another's forces with the "Let a country see another's forces" effect, which the assistant uses for plans like "let me see their troops".
- **Interception:** an agent in a country has an even chance of copying each note sent to or from that country's delegates. The copy appears in the spy owner's Notes tab marked "Intercepted by your agent". The sender is never told. Staff see who intercepted what.
- **Recall or capture:** staff open Features and spies, then click **Recall**, or **Caught** to post an arrest headline.

## Delegates and the backroom

21 delegates. Big powers have a political lead plus one or two military commanders; smaller powers have one military commander.

| Country | Political lead | Military |
|---|---|---|
| United Kingdom | Neville Chamberlain, Prime Minister | Winston Churchill (navy, air), Edmund Ironside (army, tanks) |
| France | Édouard Daladier, Prime Minister | Maurice Gamelin (army, tanks, air), François Darlan (navy) |
| Germany | Joachim von Ribbentrop, Foreign Minister | Gerd von Rundstedt (army, tanks, air), Erich Raeder (navy) |
| Soviet Union | Vyacheslav Molotov | Georgy Zhukov (all forces) |
| United States | Franklin D. Roosevelt, President | George C. Marshall (army, tanks, air), Harold Stark (navy) |
| Japan | Nobuyuki Abe, Prime Minister | Hideki Tojo (army, tanks, air), Isoroku Yamamoto (navy) |
| Italy | Galeazzo Ciano, Foreign Minister | Pietro Badoglio (all forces) |
| Poland | (backroom) | Edward Rydz-Śmigły (all forces) |
| Finland | (backroom) | Carl Gustaf Mannerheim (all forces) |

- **Political leads** declare war, make peace, sign treaties and set budgets. **Military delegates** command forces; for war or peace they ask their political lead, or, where there is none, their head of government in the backroom.
- **The backroom:** a crisis note can be addressed to someone who is not a delegate (the "To:" line on the paper). Crisis staff answer as that person, and the reply arrives as "Reply from Adolf Hitler". Backroom figures: Hitler, Göring, Canaris, Stalin, Beria, Mussolini, Emperor Hirohito, King George VI, Lord Halifax, President Lebrun, Cordell Hull, President Mościcki, Józef Beck, President Kallio, Aimo Cajander, Chiang Kai-shek, Mao Zedong, Franco, İnönü, Horthy, King Carol II, Per Albin Hansson and Pope Pius XII.
- **New codes:** the roster changed, so every delegate has a new access code (see Access codes on the staff map). Old delegate logins for removed names stop working.

## Preview, backups and load

- **No assistant:** staff decide everything by hand. Each request card has a reply box and three buttons. **Make changes** opens staging on the staff map, starting from what the request would do on its own (a move order already moved, a build already built). Drag units, spawn forces, build, give regions, run battles, or click any figurine in **Figurines** and click the map as many times as you like, then **OK**. The slim bar at the top counts the changes. **Go** sends them to every screen and approves the request with whatever is in the reply box; tick **Secret** to keep the changes off the projector. **Approve** and **Reject** answer straight away with the reply. Passed directives and **Make something happen** (with an optional headline and breaking news) use the same **Make changes** staging.
- **Make changes screen:** the sidebar has two tabs, **Place forces and features** and **Announce**. Pick a delegate country or open **Other countries (played by the chairs)** for about 35 more (Spain, Canada, Turkey, China, Brazil and others). Drag a unit on the map (the figure or its label) to move it: a dashed gold arrow shows where it will go after **Go**. Click a unit to get a card right above it: rename it, type a new size in real men, tanks, planes or ships, **Delete**, or **Done**. Regions and features get the same kind of card. **Undo** (or Ctrl+Z) takes back one change at a time; **Start over** clears them all. Units changed but not sent are tagged **Not live yet**; units the projector cannot see are tagged **Hidden from projector**. Esc unselects; Delete removes the selected unit. There are no battle odds or edges: the chairs decide who wins.
- **Delegates** only write crisis notes. Clicking a unit shows its name, size and location; moving, building and money all go through a crisis note.
- **Fog of war applies to everything:** delegates see other sides' units, features and pins only where their own or allied forces, their agents or air reconnaissance can see, however the thing was created.
- **Backups:** saved automatically every 3 minutes of changes and before any reset, demo load or restore (newest 40 kept, in the same Supabase table). The **Game** pop-up lists them with Restore, can save one now with a name, and can download the whole game as a file or restore from such a file. A restore backs up the current game first.
- **Server load:** screens check a version number and only download the game when it changed; they poll every 1.5 seconds while things are happening, 2.5 seconds when quiet and 8 seconds in hidden tabs. A local load test of 24 screens, 5 delegates passing notes, 3 people typing one directive and steady crisis notes for a minute had no errors (4 to 15 ms per request), though it ran on server memory rather than Supabase.

## Game clock

- **The date runs by itself** on every screen. At normal speed 12 real hours take the war from 3 September 1939, 17:00 to 1 December 1941, which is about 27 game hours per real minute (a game day every 53 seconds).
- **Staff control it** from the **Clock** button on the staff map: pause and start, half, normal, double or four times speed, or jump to any date. Pause it for breaks and lunch.
- **A new game starts with the clock running.** A game saved before the clock existed starts paused at 3 September 1939; press Start the clock.
- **Crisis updates** fill in the current game date automatically. Staff can still type a different one.

## Map look and speed

- **Flags:** every country's land shows its 1939 flag faintly, one flag per landmass at its true 3:2 shape; colonies and mandates show the ruling power's flag. Occupied regions show the occupier's flag with stripes in its color and a dashed edge.
- **Speed:** the detailed Europe map and the world map are painted once. Occupation, the selected country and the fog of war live on light layers above them, so moves and occupations redraw a small image instead of the whole map.
- **Cities:** about 100 named cities are clickable for a card with who holds them, what they are known for, forces nearby and what is built there. Forces are built only in cities the country holds; ships need a port.

## Delegate screen

- **Portfolio** is the briefcase button at the top left of the map. It opens to show the delegate's powers, assets, limits and a sealed secret file.
- **Writing:** crisis notes and passed notes open on paper in the middle of the screen. "Mark a spot on the map" tucks the paper away until the delegate clicks the map.
- **Mail:** crisis staff replies, new notes and new intel arrive as an envelope at the bottom of the screen. Clicking opens the letter, the note (on torn lined paper) or the intel file.
- **Blocs** are standing group chats for passing notes. Any delegate can start one from the Messages tab, name it and invite others; members can invite more or leave. Everyone in the bloc sees every note, including ones sent before they joined. Crisis staff read all of them, and spies in a member's country can intercept them like any note.
- **Unit sizes** show as real numbers: one strength point is one infantry division (about 13,000 to 18,000 men depending on the country), one tank division or brigade (30 to 300 tanks), 100 aircraft, or a capital ship with escorts (5 ships). Staff still edit the strength points.
- **Directives** are written on a laptop in a shared document. The author can invite other delegates with Share; everyone on the draft types at once, sees who is typing in each clause, and changes save on their own. "Send for signatures" turns the draft into a directive that needs 4 names in total (co-authors count).

## Map features and unit traits

These turn free-form plans into things that show on the map and count in battles.

- **Map features** are 3D props on the globe:
  - trenches, bunkers and barbed wire (each can run as a line between two spots)
  - minefields, anti-aircraft guns, factories, airfields, oil fields, ports, bridges, partisan camps and fires
  - artillery, railway guns, pillboxes, searchlights, barrage balloons, radar, field headquarters, barracks, supply depots, motor pools, field hospitals and checkpoints
  - supply convoys, railways, anti-tank obstacles, sandbag walls, refugee columns and naval blockades (these can also run as lines)
  - bomber formations, paratroopers, cavalry, submarines, naval mines, shipyards, radio stations, embassies and prison camps
  - riots, labor strikes, scorched earth, bombed ruins and flooded land
- **No labels on the map.** Features and spies are models only. Click one to see what it is (staff and the projector open its card; delegates get a pop-up).
- **Spies** show as small figures in a trench coat and hat, visible to their own side and to crisis staff.
- **Each feature has a defense value.** Trenches +1, bunkers +2, pillboxes +2, wire, minefields, anti-aircraft guns, artillery, sandbags, anti-tank obstacles, checkpoints, headquarters, naval mines and flooding +1 by default; a riot is -1. Each +1 is worth +25% for the side defending near it.
- **The battle calculator adds features automatically** when they sit within about 1.4° of the defending units. Staff can untick any of them. A winning attacker can overrun them, which marks them destroyed.
- **Build time:** a feature can be ready now or after 1 to 3 crisis updates. Until then it shows as a see-through model with scaffolding. When it finishes, the wire announces it if it is public.
- **Destroyed features** turn dark, with fire and smoke. Oil fields burn.
- **Secret features** are only seen by the owner's side, until enemy units, planes, recon or agents get close.
- **Unit traits** (for example "Winter gear +1", "Low on fuel −1", "Veteran +1") change that unit's strength in the battle calculator by 25% per point.
- **Where staff add them:**
  - as an effect when approving a plan ("Where the delegate marked" uses the spot the delegate clicked);
  - in **Make something happen**;
  - in the **map editor**, by clicking the map (two clicks for a line).
- **Delegates** see features as small icons when zoomed out and full models when zoomed in. Hovering an icon explains it. The button above the zoom controls hides all features.

## Delegate requests

The Actions tab opens on one box: **What do you want to do?** Delegates write any feasible plan there, with an optional budget and map spot. Three buttons above it open quick forms for moves the app carries out exactly: move forces, build forces and send money.

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
- [ ] Approve a move **on projector**: the unit glides on the projector.
- [ ] Approve a move **secretly**: the projector shows nothing; the delegate sees the move; **Reveal on projector** makes it visible.
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

### 4. Full dress rehearsal (1 to 2 weeks before April 3 and 4)
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

### Treasuries

Each country's starting treasury is its **1938 military spending** in millions of US dollars, from the Correlates of War National Material Capabilities dataset (v6, `milex`, read from the [peacesciencer](https://github.com/svmiller/peacesciencer) package). The 1938 figures match the table in Paul Kennedy's *The Rise and Fall of the Great Powers*. 1938 is used because the dataset's 1939 entries are weakly sourced.

| Country | Treasury |
|---|---|
| Germany | $7,415M |
| Soviet Union | $5,430M |
| United Kingdom | $1,864M |
| Japan | $1,699M |
| United States | $1,131M |
| France | $919M |
| Italy | $746M |
| Poland | $152M |
| Finland | $27M |

**Costs are still game values.** Build costs ($40M per infantry division, $90M per armored division, $60M per 100 aircraft, $75M per capital ship) are not historical. Staff should judge whether they feel right against these budgets.

## Map imagery

- The ground is NASA Blue Marble Next Generation (August 2004), public domain. The Europe patch is cut from the 21,600-pixel original.
- Coastlines and lakes come from Natural Earth (public domain).
- Fixed in the 1938 border data: the Smyrna (İzmir) area is Turkish, not Greek, and Jutland's center no longer sits in Greenland.
