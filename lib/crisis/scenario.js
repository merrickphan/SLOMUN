// Early WWII crisis scenario. Shared by the server (rules) and the browser (drawing).
// Numbers here are starting placeholders for crisis staff to adjust before the conference.

export const LON0 = -30, LON1 = 65, LAT0 = 25, LAT1 = 75;
// Treasuries: 1938 military spending in millions of US dollars, from the Correlates of War
// National Material Capabilities dataset (v6, milex). 1938 is the last full prewar year.
export const POWERS = {
  'United Kingdom': { color: '#E0463A', side: 'war', label: 'United Kingdom', short: 'UK', treasury: 1864, cur: '$', delegates: ["Neville Chamberlain", "Winston Churchill", "Edmund Ironside"] },
  'France': { color: '#3FAE3A', side: 'war', label: 'France', short: 'France', treasury: 919, cur: '$', delegates: ["Édouard Daladier", "Maurice Gamelin", "François Darlan"] },
  'Germany': { color: '#8E8E70', side: 'war', label: 'Germany', short: 'Germany', treasury: 7415, cur: '$', delegates: ["Joachim von Ribbentrop", "Gerd von Rundstedt", "Erich Raeder"] },
  'Poland': { color: '#E8E2F0', side: 'war', label: 'Poland', short: 'Poland', treasury: 152, cur: '$', delegates: ["Edward Rydz-Śmigły"] },
  'Italy': { color: '#3D8FD6', side: 'neutral', label: 'Italy', short: 'Italy', treasury: 746, cur: '$', delegates: ["Galeazzo Ciano", "Pietro Badoglio"] },
  'USSR': { color: '#9C2F55', side: 'neutral', label: 'Soviet Union', short: 'USSR', treasury: 5430, cur: '$', delegates: ["Vyacheslav Molotov", "Georgy Zhukov"] },
  'United States': { color: '#4F7BD9', side: 'neutral', label: 'United States', short: 'USA', treasury: 1131, cur: '$', delegates: ["Franklin D. Roosevelt", "George C. Marshall", "Harold Stark"] },
  'Japan': { color: '#E06C9F', side: 'neutral', label: 'Japan', short: 'Japan', treasury: 1699, cur: '$', delegates: ["Nobuyuki Abe", "Hideki Tojo", "Isoroku Yamamoto"] },
  'Finland': { color: '#7FD3F0', side: 'neutral', label: 'Finland', short: 'Finland', treasury: 27, cur: '$', delegates: ["Carl Gustaf Mannerheim"] },
};
// Colonies and occupied land take a power's color.
export const OWNER = { 'Empire of Japan': 'Japan', 'Czechoslovakia': 'Germany', 'Libya': 'Italy', 'Albania': 'Italy', 'Algeria': 'France', 'Tunisia': 'France', 'Morocco': 'France', 'Syria': 'France' };
export const NEUTRALS = { 'Spain': '#D08A2E', 'Portugal': '#7E9A3A', 'Sweden': '#8E6FB0', 'Norway': '#C29A3E', 'Denmark': '#C04FA8', 'Netherlands': '#E07A2E', 'Belgium': '#C9B13A', 'Switzerland': '#B05050', 'Ireland': '#5BAF6A', 'Hungary': '#B0567A', 'Romania': '#C7B04A', 'Yugoslavia': '#6A6FC0', 'Bulgaria': '#4FA07A', 'Greece': '#4E8FC0', 'Turkey': '#5FAE5A', 'Lithuania': '#C8C24A', 'Latvia': '#9F5FC0', 'Estonia': '#3F9FB0', 'Luxembourg': '#7FB0D0', 'Egypt': '#C9A05A', 'Mesopotamia': '#9A7A50', 'Iran': '#5A9A7A' };
export const SKIP_LABEL = new Set(['Andorra', 'Luxembourg', 'Israel', 'Mandatory Palestine', 'Qatar', 'Trucial Oman', 'Hail', "Emirate of Bin Shal'an"]);
export const LABELS = { 'United Kingdom': [-2.2, 53.2, 15], 'France': [2.4, 46.8, 22], 'Germany': [10.2, 51.2, 20], 'Poland': [23.6, 52.9, 14], 'Italy': [12.6, 42.6, 15], 'USSR': [36, 55, 28], 'Finland': [26.5, 64, 15], 'Spain': [-3.8, 40, 20], 'Sweden': [15.5, 63.2, 14], 'Norway': [9.5, 61.5, 13], 'Romania': [25, 45.8, 14], 'Yugoslavia': [18.8, 44.2, 12], 'Turkey': [33.5, 39, 18], 'Hungary': [19.2, 47.1, 10], 'Bulgaria': [25.2, 42.7, 10], 'Greece': [22, 39.5, 10], 'Czechoslovakia': [15.4, 49.6, 9] };
export const SKIP_WORLD = new Set(['Denmark', "Emirate of Bin Shal'an", 'Hail', 'Rio De Oro', 'Spanish Sahara', 'Trucial Oman', 'Muscat and Oman']);
export const LABEL_TEXT = { 'Tanzania, United Republic of': 'Tanganyika', 'Chinese warlords': 'China', 'Empire of Japan': 'Japan', 'Union of South Africa': 'South Africa', 'Belgian Congo': 'Belgian Congo', 'Dutch East Indies': 'Dutch East Indies', 'USSR': 'Soviet Union', 'United Kingdom': 'Britain', 'Czechoslovakia': 'Occupied Czech lands' };
// Starting forces on September 3, 1939. Strength units:
//   armies and armor: divisions (or brigades where the note says so)
//   fleets: capital ships (battleships, battlecruisers, pocket battleships and aircraft carriers)
//   air forces: hundreds of front-line combat aircraft (19 = about 1,900)
// Notes marked "estimate" could not be confirmed from sources; crisis staff should check them.
export const UNITS = [
  { id: 'ag-north', owner: 'Germany', name: 'Army Group North', kind: 'army', at: [16.0, 54.0], str: 18, note: '16 infantry and 2 motorized divisions (3rd and 4th Armies), attacking from Pomerania and East Prussia toward Warsaw.' },
  { id: 'ag-south', owner: 'Germany', name: 'Army Group South', kind: 'army', at: [18.2, 49.6], str: 24, note: '21 infantry and 3 mountain divisions (8th, 10th and 14th Armies), attacking from Silesia and Slovakia.' },
  { id: 'pz', owner: 'Germany', name: 'Panzer and Light Divisions', kind: 'armor', at: [16.4, 51.9], str: 10, note: '6 panzer and 4 light divisions spearheading the attack into Poland.' },
  { id: 'westwall', owner: 'Germany', name: 'Army Group C', kind: 'army', at: [7.6, 50.4], str: 30, note: 'Holding the West Wall opposite the Maginot Line.', basis: 'Estimate: sources give between 10 (Saar sector only) and 41 divisions; many were reserve units.' },
  { id: 'kriegsmarine', owner: 'Germany', name: 'Kriegsmarine', kind: 'fleet', heading: 2.2, at: [6.4, 55.0], str: 5, note: '2 battleships (Scharnhorst, Gneisenau) and 3 pocket battleships, plus about 57 U-boats. Based at Wilhelmshaven and Kiel.' },
  { id: 'luftwaffe', owner: 'Germany', name: 'Luftwaffe', kind: 'air', at: [13.2, 53.6], str: 21, note: 'About 1,000 fighters and 1,050 bombers operational. Bombing Polish airfields, rail lines and cities.' },
  { id: 'pl-pomorze', owner: 'Poland', name: 'Army Pomorze', kind: 'army', at: [18.6, 53.1], str: 5, note: '5 infantry divisions and a cavalry brigade defending the Polish Corridor.' },
  { id: 'pl-poznan', owner: 'Poland', name: 'Army Poznań', kind: 'army', at: [17.2, 52.2], str: 4, note: '4 infantry divisions and 2 cavalry brigades in the western salient.' },
  { id: 'pl-lodz', owner: 'Poland', name: 'Army Łódź', kind: 'army', at: [19.2, 51.6], str: 4, note: '4 infantry divisions and 2 cavalry brigades defending the western approach to Warsaw.' },
  { id: 'pl-krakow', owner: 'Poland', name: 'Army Kraków', kind: 'army', at: [20.6, 50.3], str: 5, note: '5 infantry divisions, a mountain brigade and a cavalry brigade defending the southwest.' },
  { id: 'pl-modlin', owner: 'Poland', name: 'Army Modlin', kind: 'army', at: [20.8, 52.9], str: 2, note: '2 infantry divisions and 2 cavalry brigades north of Warsaw.' },
  { id: 'pl-prusy', owner: 'Poland', name: 'Army Prusy', kind: 'army', at: [20.3, 51.1], str: 6, note: 'The main reserve: 6 infantry divisions and a cavalry brigade, still assembling.' },
  { id: 'pl-armor', owner: 'Poland', name: 'Motorized Brigades', kind: 'armor', at: [21.4, 51.0], str: 2, note: 'The 10th Motorized Cavalry Brigade and the Warsaw Armored-Motorized Brigade.' },
  { id: 'pl-air', owner: 'Poland', name: 'Polish Air Force', kind: 'air', at: [22.6, 52.9], str: 4, note: 'About 400 combat aircraft, mostly outdated, flying from dispersed airfields.' },
  { id: 'fr-ne', owner: 'France', name: 'Northeast Front', kind: 'army', at: [5.4, 48.9], str: 85, note: 'About 85 divisions mobilizing along the Maginot Line and the Belgian border.', basis: 'Sources differ on the exact count.' },
  { id: 'fr-alps', owner: 'France', name: 'Army of the Alps', kind: 'army', at: [6.0, 45.0], str: 10, note: 'About 175,000 men watching the Italian border.', basis: 'Division count is an estimate.' },
  { id: 'fr-armor', owner: 'France', name: 'Light Mechanized Divisions', kind: 'armor', at: [3.0, 49.4], str: 2, note: '2 light mechanized divisions. Most French tanks are spread among infantry units.' },
  { id: 'fr-air', owner: 'France', name: "Armée de l'Air", kind: 'air', at: [1.0, 47.2], str: 11, note: '634 fighters and 463 bombers, many of them obsolete.' },
  { id: 'fr-navy', owner: 'France', name: 'French Navy', kind: 'fleet', heading: 1.2, at: [-6.5, 47.6], str: 8, note: '7 battleships and 1 aircraft carrier. Atlantic squadrons at Brest; Mediterranean fleet at Toulon.' },
  { id: 'bef', owner: 'United Kingdom', name: 'British Expeditionary Force', kind: 'army', at: [-1.6, 51.3], str: 4, note: '4 divisions (I and II Corps) forming in southern England to cross to France.' },
  { id: 'raf', owner: 'United Kingdom', name: 'Royal Air Force', kind: 'air', at: [-1.2, 53.6], str: 19, note: '1,911 first-line aircraft in Bomber, Fighter and Coastal Commands.' },
  { id: 'home-fleet', owner: 'United Kingdom', name: 'Home Fleet', kind: 'fleet', heading: 2.6, at: [-1.5, 59.8], str: 12, note: 'Based at Scapa Flow.', basis: 'The Royal Navy has 15 battleships and battlecruisers and 7 carriers in all; this split is an estimate.' },
  { id: 'med-fleet', owner: 'United Kingdom', name: 'Mediterranean Fleet', kind: 'fleet', heading: 1.6, at: [15.5, 34.8], str: 5, note: 'Based at Malta and Alexandria.', basis: 'Split of ships between fleets is an estimate.' },
  { id: 'it-army', owner: 'Italy', name: 'Royal Army', kind: 'army', at: [8.6, 45.3], str: 73, note: 'Planners judged 73 divisions possible, short of ammunition, fuel and transport. Not mobilized for war.' },
  { id: 'it-air', owner: 'Italy', name: 'Regia Aeronautica', kind: 'air', at: [11.3, 44.4], str: 12, note: '1,190 operational aircraft out of 2,586. Not mobilized for war.' },
  { id: 'regia-marina', owner: 'Italy', name: 'Regia Marina', kind: 'fleet', heading: 0.9, at: [18.6, 39.2], str: 2, note: '2 battleships in service and 2 being rebuilt; no aircraft carriers. Based at Taranto.', basis: 'Estimate: check before the conference.' },
  { id: 'su-belo', owner: 'USSR', name: 'Belorussian Military District', kind: 'army', at: [28.0, 54.2], str: 16, note: 'Massed on the Polish border. Its intentions are unknown.', basis: 'Part of a force of 33 or more divisions on the Polish border; the split between districts is an estimate.' },
  { id: 'su-kiev', owner: 'USSR', name: 'Kiev Special Military District', kind: 'army', at: [29.8, 50.0], str: 17, note: 'Massed on the Polish border. Its intentions are unknown.', basis: 'Part of a force of 33 or more divisions on the Polish border; the split between districts is an estimate.' },
  { id: 'su-armor', owner: 'USSR', name: 'Tank Brigades', kind: 'armor', at: [31.6, 52.4], str: 9, note: '9 tank brigades (strength counts brigades). Thousands of light tanks.' },
  { id: 'su-air', owner: 'USSR', name: 'Soviet Air Forces', kind: 'air', at: [33.5, 55.2], str: 33, note: 'About 3,300 aircraft in the western districts.' },
  { id: 'us-atlantic', owner: 'United States', name: 'Atlantic Squadron', kind: 'fleet', heading: 1.6, at: [-68, 36.5], str: 4, note: 'Neutrality patrol off the American coast.', basis: 'Ship count is an estimate.' },
  { id: 'us-pacific', owner: 'United States', name: 'Pacific Battle Force', kind: 'fleet', heading: 2.4, at: [-150, 25], str: 17, note: '12 battleships and 5 aircraft carriers, based in California and Hawaii.' },
  { id: 'us-air', owner: 'United States', name: 'Army Air Corps', kind: 'air', at: [-82, 38.5], str: 8, note: 'About 800 first-line combat aircraft, including only 23 B-17 bombers. No forces in Europe.' },
  { id: 'jp-fleet', owner: 'Japan', name: 'Combined Fleet', kind: 'fleet', heading: 2.0, at: [137, 31.5], str: 16, note: '10 battleships and 6 aircraft carriers, based in the Inland Sea.', basis: 'Estimate: check before the conference.' },
  { id: 'jp-army', owner: 'Japan', name: 'Kwantung Army', kind: 'army', at: [125.5, 44.5], str: 6, note: '6 regular divisions in Manchuria, just defeated by the Soviets at Nomonhan.' },
  { id: 'jp-army-china', owner: 'Japan', name: 'China Expeditionary Army', kind: 'army', at: [115, 32], str: 23, note: '23 divisions and 28 brigades, at war in China since 1937.' },
  { id: 'jp-air', owner: 'Japan', name: 'Naval Air Service', kind: 'air', at: [132, 36], str: 10, note: 'Carrier and land-based air groups.', basis: 'Estimate: no confirmed 1939 figure found.' },
  { id: 'fi-army', owner: 'Finland', name: 'Karelian Isthmus Defenses', kind: 'army', at: [29.6, 61.0], str: 3, note: 'Peacetime army, not yet mobilized.', basis: 'Grew to 6 divisions on the isthmus by November 1939. Estimate: check before the conference.' },
];
export const ARROWS = [
  [[14.6, 53.5], [17.6, 53.0], [20.3, 52.4]],
  [[20.6, 54.3], [21.2, 53.4], [21.1, 52.6]],
  [[17.2, 51.0], [18.8, 51.6], [20.3, 52.0]],
  [[19.4, 48.9], [19.8, 49.5], [19.9, 50.0]],
];
export const CITIES = { London: [-0.13, 51.5], Paris: [2.35, 48.86], Berlin: [13.4, 52.52], Warsaw: [21.0, 52.23], Rome: [12.5, 41.9], Moscow: [37.6, 55.75], Danzig: [18.65, 54.35], Prague: [14.42, 50.08], Vienna: [16.37, 48.21], Kiev: [30.52, 50.45], Leningrad: [30.3, 59.94], Madrid: [-3.7, 40.42], Stockholm: [18.07, 59.33], Budapest: [19.04, 47.5] };
export const START_WIRE = ['05:00 1 SEPT · German forces cross the Polish frontier', 'Warsaw reports air raids on Polish cities', '11:00 3 SEPT · Britain at war with Germany', 'Churchill returns to the Admiralty', '17:00 3 SEPT · France at war with Germany', 'Rome silent on the Pact of Steel', 'Moscow gives no statement'];
export const CAPITAL = { Japan: [139.7, 35.7], 'United Kingdom': [-0.13, 51.5], 'United States': [-77.04, 38.9], Germany: [13.4, 52.52], Italy: [12.5, 41.9], 'Soviet Union': [37.6, 55.75], France: [2.35, 48.86], Poland: [21.0, 52.23], Finland: [24.94, 60.17], Sweden: [18.07, 59.33], Spain: [-3.7, 40.42], Hungary: [19.04, 47.5], Romania: [26.1, 44.43] };
export const CITY_OF = { Japan: 'Tokyo', 'United Kingdom': 'London', 'United States': 'Washington', Germany: 'Berlin', Italy: 'Rome', 'Soviet Union': 'Moscow', France: 'Paris', Poland: 'Warsaw', Finland: 'Helsinki', Sweden: 'Stockholm', Spain: 'Madrid', Hungary: 'Budapest', Romania: 'Bucharest' };
// Build costs in $ millions per unit of strength. These are game values for staff to tune, not historical prices.
export const BUILD = { 'Infantry division': 40, 'Tank division': 90, '100 aircraft': 60, 'Capital ship': 75 };
export const KIND_NAME = { fleet: 'Navy', army: 'Infantry', armor: 'Tanks', air: 'Air force' };
export const DEST_BY_KIND = {
  fleet: ['North Sea', 'Baltic approaches', 'English Channel', 'North Atlantic', 'Mediterranean', 'Pacific Ocean', 'South China Sea', 'Blockade enemy ports', 'Escort convoys across the Atlantic'],
  army: ['Advance to the front', 'Hold current lines', 'Move to the border', 'Stay home for defense'],
  armor: ['Spearhead an attack', 'Reinforce the front', 'Hold in reserve'],
  air: ['Patrol nearby seas', 'Scout enemy territory', 'Support an allied front', 'Defend home cities', 'Fly aircraft to Britain'],
};
export const ROSTER = [{"name": "Neville Chamberlain", "country": "United Kingdom", "role": "Prime Minister", "commands": [], "political": true}, {"name": "Winston Churchill", "country": "United Kingdom", "role": "First Lord of the Admiralty", "commands": ["fleet", "air"]}, {"name": "Edmund Ironside", "country": "United Kingdom", "role": "Chief of the Imperial General Staff", "commands": ["army", "armor"]}, {"name": "Édouard Daladier", "country": "France", "role": "Prime Minister and Minister of National Defence", "commands": [], "political": true}, {"name": "Maurice Gamelin", "country": "France", "role": "Commander-in-Chief of the French Army", "commands": ["army", "armor", "air"]}, {"name": "François Darlan", "country": "France", "role": "Admiral of the French Navy", "commands": ["fleet"]}, {"name": "Joachim von Ribbentrop", "country": "Germany", "role": "Foreign Minister", "commands": [], "political": true}, {"name": "Gerd von Rundstedt", "country": "Germany", "role": "Army Group commander", "commands": ["army", "armor", "air"]}, {"name": "Erich Raeder", "country": "Germany", "role": "Grand Admiral, Kriegsmarine", "commands": ["fleet"]}, {"name": "Vyacheslav Molotov", "country": "USSR", "role": "Premier and People's Commissar for Foreign Affairs", "commands": [], "political": true}, {"name": "Georgy Zhukov", "country": "USSR", "role": "Red Army commander", "commands": ["army", "armor", "air", "fleet"]}, {"name": "Franklin D. Roosevelt", "country": "United States", "role": "President", "commands": [], "political": true}, {"name": "George C. Marshall", "country": "United States", "role": "Army Chief of Staff", "commands": ["army", "armor", "air"]}, {"name": "Harold Stark", "country": "United States", "role": "Chief of Naval Operations", "commands": ["fleet"]}, {"name": "Nobuyuki Abe", "country": "Japan", "role": "Prime Minister", "commands": [], "political": true}, {"name": "Hideki Tojo", "country": "Japan", "role": "Imperial Japanese Army general", "commands": ["army", "armor", "air"]}, {"name": "Isoroku Yamamoto", "country": "Japan", "role": "Commander, Combined Fleet", "commands": ["fleet"]}, {"name": "Galeazzo Ciano", "country": "Italy", "role": "Foreign Minister", "commands": [], "political": true}, {"name": "Pietro Badoglio", "country": "Italy", "role": "Chief of the General Staff", "commands": ["army", "armor", "air", "fleet"]}, {"name": "Edward Rydz-Śmigły", "country": "Poland", "role": "Marshal of Poland, commander of all Polish forces", "commands": ["army", "armor", "air", "fleet"]}, {"name": "Carl Gustaf Mannerheim", "country": "Finland", "role": "Marshal, head of Finland's defense", "commands": ["army", "armor", "air", "fleet"]}];
export const SIDE_ALLIES = { 'United Kingdom': ['United Kingdom', 'France', 'Poland'], 'France': ['United Kingdom', 'France', 'Poland'], 'Poland': ['United Kingdom', 'France', 'Poland'],
  'Germany': ['Germany', 'Italy'], 'Italy': ['Italy', 'Germany'], 'USSR': ['USSR'], 'Finland': ['Finland'], 'United States': ['United States'], 'Japan': ['Japan'] };
export const SPOTTED_ALLIED = {
  'kriegsmarine': 'Spotted by an RAF patrol over the North Sea',
  'ag-north': 'Reported by Allied intelligence in Berlin',
  'westwall': 'Seen from French lines',
  'luftwaffe': 'Raids reported by your Polish allies',
};
export const SPOTTED_BY = {
  allied: SPOTTED_ALLIED,
  'Germany': { 'pl-pomorze': 'In contact with German troops', 'pl-lodz': 'In contact with German troops', 'pl-krakow': 'In contact with German troops', 'pl-air': 'Spotted by Luftwaffe reconnaissance', 'fr-ne': 'Seen from the West Wall', 'home-fleet': 'Reported by the Abwehr' },
  'Italy': { 'fr-alps': 'Seen across the Alpine border', 'med-fleet': 'Watched from Sicily' },
  'USSR': { 'pl-krakow': 'Reported by the Soviet embassy in Warsaw', 'ag-south': 'Reported by Soviet intelligence' },
  'Finland': { 'su-belo': 'Reported by Finnish border guards' },
  'United States': { 'home-fleet': 'Briefed by the British Admiralty', 'jp-fleet': 'Tracked by naval intelligence' },
  'Japan': { 'us-pacific': 'Tracked by naval intelligence', 'su-kiev': 'Reported by the Japanese embassy in Moscow' },
};
export const INTEL_ALLIED = [
  { from: 'Naval attaché, Rome', text: 'The Italian fleet has not left Taranto. Officers expect to stay neutral for now.', rel: 'High' },
  { from: 'Embassy, Moscow', text: 'Unusual troop trains reported heading west. Purpose unknown.', rel: 'Low' },
];
export const INTEL_BY = {
  'United Kingdom': INTEL_ALLIED, 'France': INTEL_ALLIED, 'Poland': [{ from: 'General Staff, Warsaw', text: 'German armor is pushing toward Łódź faster than planned.', rel: 'High' }],
  'Germany': [{ from: 'Abwehr', text: 'French army is mobilizing behind the Maginot Line but shows no sign of attacking.', rel: 'Medium' }, { from: 'Embassy, Moscow', text: 'The Red Army is calling up reservists in its western districts.', rel: 'Medium' }],
  'Italy': [{ from: 'Embassy, Berlin', text: 'Berlin expects Italy to stay neutral for now.', rel: 'High' }],
  'USSR': [{ from: 'Embassy, Berlin', text: 'German officers say Warsaw will fall within weeks.', rel: 'Medium' }],
  'Finland': [{ from: 'Border guards, Karelia', text: 'More Soviet units seen near Leningrad.', rel: 'Low' }],
  'Japan': [{ from: 'Embassy, Berlin', text: 'Germany will not need Japanese help in Poland.', rel: 'Medium' }, { from: 'Naval intelligence', text: 'The American Pacific Fleet is staying in Hawaii for now.', rel: 'High' }],
  'United States': [{ from: 'Embassy, London', text: 'Britain wants to buy American aircraft if the Neutrality Acts change.', rel: 'High' }],
};
export const POWER_TEXT = {
  fleet: 'Move and command your country\'s fleets, set patrols and blockades',
  army: 'Move infantry armies and order attacks or defensive lines',
  armor: 'Move tank divisions and plan armored attacks',
  air: 'Order air patrols, reconnaissance, bombing and air defense',
};
export const ALWAYS = ['Send spies abroad on missions you fund', 'Request money from your treasury for operations', 'Issue press releases in your own name', 'Sponsor and sign committee directives'];
export const LIMITS_ALWAYS = ['Signing treaties for your country alone'];
// Political delegates run diplomacy; military delegates run forces and ask the political side (or the backroom) for war and peace.
export const POLITICAL_POWERS = ['Declare war or make peace for your country', 'Negotiate alliances, pacts and trade deals', 'Set the war budget and fund the military', 'Speak for your government in public and to foreign leaders'];
export const MILITARY_LIMIT = (r) => { const pol = ROSTER.find((x) => x.country === r.country && x.political); return `Declaring war or making peace (${pol ? `ask ${pol.name}` : `ask your head of government in the backroom`})`; };
// Backroom figures: people who are not delegates but can be written to. Crisis staff answer as them.
export const BACKROOM = [
  { name: 'Adolf Hitler', title: 'Führer of Germany', country: 'Germany' },
  { name: 'Hermann Göring', title: 'Commander of the Luftwaffe', country: 'Germany' },
  { name: 'Wilhelm Canaris', title: 'Chief of the Abwehr', country: 'Germany' },
  { name: 'Joseph Stalin', title: 'General Secretary of the Communist Party', country: 'USSR' },
  { name: 'Lavrentiy Beria', title: 'Head of the NKVD', country: 'USSR' },
  { name: 'Benito Mussolini', title: 'Duce of Italy', country: 'Italy' },
  { name: 'Emperor Hirohito', title: 'Emperor of Japan', country: 'Japan' },
  { name: 'King George VI', title: 'King of the United Kingdom', country: 'United Kingdom' },
  { name: 'Lord Halifax', title: 'British Foreign Secretary', country: 'United Kingdom' },
  { name: 'Albert Lebrun', title: 'President of France', country: 'France' },
  { name: 'Cordell Hull', title: 'US Secretary of State', country: 'United States' },
  { name: 'Ignacy Mościcki', title: 'President of Poland', country: 'Poland' },
  { name: 'Józef Beck', title: 'Polish Foreign Minister', country: 'Poland' },
  { name: 'Kyösti Kallio', title: 'President of Finland', country: 'Finland' },
  { name: 'Aimo Cajander', title: 'Prime Minister of Finland', country: 'Finland' },
  { name: 'Chiang Kai-shek', title: 'Leader of the Republic of China', country: 'China' },
  { name: 'Mao Zedong', title: 'Leader of the Chinese Communists', country: 'China' },
  { name: 'Francisco Franco', title: 'Head of State of Spain', country: 'Spain' },
  { name: 'İsmet İnönü', title: 'President of Turkey', country: 'Turkey' },
  { name: 'Miklós Horthy', title: 'Regent of Hungary', country: 'Hungary' },
  { name: 'King Carol II', title: 'King of Romania', country: 'Romania' },
  { name: 'Per Albin Hansson', title: 'Prime Minister of Sweden', country: 'Sweden' },
  { name: 'Pope Pius XII', title: 'Head of the Catholic Church', country: 'Vatican' },
];
export const backroomNamed = (n) => BACKROOM.find((b) => b.name === n) || null;
// Placeholder secret objectives. Crisis staff should write the real ones.
export const SECRET = {
  "Neville Chamberlain": "Keep France in the war while avoiding a bloody land offensive; leave the door open to a negotiated peace.",
  "Winston Churchill": "Win control of the North Sea and Norwegian waters before Germany does.",
  "Edmund Ironside": "Get the British Expeditionary Force into France and ready to fight by October.",
  "Édouard Daladier": "Keep Britain committed to France and avoid a French offensive until the army is ready.",
  "Maurice Gamelin": "Avoid a major attack on Germany until the army is fully ready.",
  "François Darlan": "Keep the French fleet strong and under French control no matter what.",
  "Joachim von Ribbentrop": "Keep Britain and France from fighting seriously while Poland is defeated.",
  "Gerd von Rundstedt": "Take Warsaw before the Western Allies can attack.",
  "Erich Raeder": "Get more money for the navy than the Luftwaffe.",
  "Vyacheslav Molotov": "Secure eastern Poland and the Baltic states under the secret pact without fighting Germany.",
  "Georgy Zhukov": "Prepare the Red Army to move west at short notice.",
  "Franklin D. Roosevelt": "Get the Neutrality Acts changed so Britain and France can buy American arms.",
  "George C. Marshall": "Build up the US Army without alarming isolationists in Congress.",
  "Harold Stark": "Keep the Pacific Fleet ready in case Japan moves south.",
  "Nobuyuki Abe": "End the war in China on Japan's terms and avoid a war with the Soviet Union.",
  "Hideki Tojo": "Win the war in China before the West can interfere.",
  "Isoroku Yamamoto": "Keep Japan out of a war with the United States.",
  "Galeazzo Ciano": "Keep Italy out of the war while staying on good terms with Germany.",
  "Pietro Badoglio": "Avoid war until the army is ready, at least until 1942.",
  "Edward Rydz-Śmigły": "Hold out until Britain and France attack in the west.",
  "Carl Gustaf Mannerheim": "Keep Finland neutral and strengthen the Karelian defenses.",
};
export const SPECIAL = {
  'United Kingdom': 'Access to the British Empire\'s colonies and dominions', 'France': 'The Maginot Line fortifications', 'Germany': 'The Abwehr intelligence service',
  'USSR': 'Secret contacts in Berlin from the August pact', 'Italy': 'Bases in Libya and the Dodecanese islands', 'United States': 'American factories and shipyards',
  'Japan': 'Bases across the western Pacific', 'Poland': 'The Polish cipher team', 'Finland': 'Detailed maps of the Karelian Isthmus',
};
export const SIGS_NEEDED = 4;
export const DSTATUS = { drafting: 'Drafting', signing: 'Collecting signatures', chair: 'With the chair', floor: 'On the floor', passed: 'Passed', failed: 'Failed' };
export const SEAS = { 'North Sea': [3.5, 56.5], 'Baltic approaches': [11.6, 57.2], 'English Channel': [-2.2, 50.1], 'North Atlantic': [-25, 52], 'Mediterranean': [18, 35], 'Pacific Ocean': [-160, 28], 'South China Sea': [114, 13], 'Escort convoys across the Atlantic': [-35, 48] };
export const OBJECTIVE = { 'United Kingdom': [13.4, 52.5], France: [13.4, 52.5], Poland: [13.4, 52.5], Germany: [21, 52.2], USSR: [21, 52.2], Italy: [6.5, 45], Japan: [116.4, 39.9], Finland: [30.3, 59.9], 'United States': [-30, 45] };
export const HOME = { 'United Kingdom': [-0.13, 51.5], France: [2.35, 48.86], Poland: [21, 52.2], Germany: [13.4, 52.5], USSR: [37.6, 55.75], Italy: [12.5, 41.9], Japan: [139.7, 35.7], Finland: [24.9, 60.2], 'United States': [-77, 38.9] };
export const BLOCKADE = { 'United Kingdom': [7, 54.6], France: [7, 54.6], Poland: [18.8, 54.8], Germany: [-3, 50.4], USSR: [20, 56], Italy: [5, 38], Japan: [121, 30], 'United States': [-10, 40], Finland: [27, 59.8] };
export function toward(from, to, maxDeg) { const dx = to[0] - from[0], dy = to[1] - from[1]; const d = Math.hypot(dx, dy); if (!d) return from.slice(); const k = Math.min(1, maxDeg / d); return [from[0] + dx * k, from[1] + dy * k]; }
export function destFor(u, dest) {
  if (SEAS[dest]) return SEAS[dest];
  const tgt = OBJECTIVE[u.owner] || u.at, home = HOME[u.owner] || u.at;
  switch (dest) {
    case 'Blockade enemy ports': return BLOCKADE[u.owner] || u.at;
    case 'Advance to the front': return toward(u.at, tgt, 3);
    case 'Move to the border': return toward(u.at, tgt, 1.8);
    case 'Spearhead an attack': return toward(u.at, tgt, 3.4);
    case 'Reinforce the front': return toward(u.at, tgt, 2);
    case 'Hold in reserve': case 'Stay home for defense': case 'Defend home cities': return toward(u.at, home, 4);
    case 'Scout enemy territory': return toward(u.at, tgt, 3.5);
    case 'Support an allied front': return ALLY_FRONT[u.owner] || toward(u.at, tgt, 3);
    case 'Fly aircraft to Britain': return [-1.5, 52.6];
    case 'Patrol nearby seas': return Object.values(SEAS).reduce((a, b) => Math.hypot(b[0] - u.at[0], b[1] - u.at[1]) < Math.hypot(a[0] - u.at[0], a[1] - u.at[1]) ? b : a);
    default: return u.at;
  }
}
export const ALLY_FRONT = { 'United Kingdom': [6.5, 49.3], France: [19.5, 51.6], Poland: [19.5, 51.6], Germany: [20, 52], Italy: [6.5, 45] };
export const LABEL_TO_KEY = Object.fromEntries(Object.entries(POWERS).map(([k, p]) => [p.label, k]));
export const BUILD_KIND = { 'Infantry division': 'army', 'Tank division': 'armor', '100 aircraft': 'air', 'Capital ship': 'fleet' };
export const DEFAULT_REPLY = {
  fleet: ['Orders received. Your forces are moving.', 'The move is not possible right now.'],
  spy: ['Your agent reports back with useful information.', 'Your agent found nothing useful.', 'Your agent has been arrested.'],
  money: ['The transfer has gone through.', 'The treasury refuses the transfer.'],
  build: ['The new forces are raised and on the map.', 'Factories cannot take on this order.'],
  op: ['The operation is under way.', 'The operation is called off.'],
  propaganda: ['The campaign is running.', 'The campaign is blocked by censors.'],
  secret: ['Your plan is carried out.', 'Your plan does not go ahead.'],
  press: ['Published to the room.', 'Not published.'],
  treaty: ['The other side is willing to talk.', 'The other side refuses.'],
};

export const KINDS = ['fleet', 'army', 'armor', 'air'];
export const REQUEST_TYPES = ['fleet', 'spy', 'money', 'build', 'op', 'propaganda', 'secret', 'press', 'treaty'];
export const ORDER = ['United Kingdom', 'France', 'Poland', 'Germany', 'Italy', 'USSR', 'United States', 'Japan', 'Finland'];
export const alliesOf = (country) => SIDE_ALLIES[country] || [country];
export const spottedKeyOf = (country) => (alliesOf(country).includes('United Kingdom') ? 'allied' : country);
export const START_UPDATE = { no: 1, date: 'September 3, 1939 · 17:00', title: 'Britain and France declare war', text: 'Britain and France are at war with Germany. Germany is advancing into Poland on three fronts.' };
export const rosterEntry = (name) => ROSTER.find((r) => r.name === name);

// Map features: things built, dug or destroyed on the map. `mod` is the defense bonus a feature gives
// the side holding it, in steps of +25% in the battle calculator. Line features run between two points.
export const FEATURES = {
  trench: { name: 'Trenches', mod: 1, line: true },
  fort: { name: 'Bunkers', mod: 2, line: true },
  wire: { name: 'Barbed wire', mod: 1, line: true },
  mines: { name: 'Minefield', mod: 1 },
  flak: { name: 'Anti-aircraft guns', mod: 1 },
  factory: { name: 'Factory', mod: 0 },
  airfield: { name: 'Airfield', mod: 0 },
  oil: { name: 'Oil field', mod: 0 },
  port: { name: 'Port', mod: 0 },
  bridge: { name: 'Bridge', mod: 0 },
  camp: { name: 'Partisan camp', mod: 0 },
  fire: { name: 'Fire', mod: 0 },
  artillery: { name: 'Artillery battery', mod: 1 },
  railgun: { name: 'Railway gun', mod: 1 },
  pillbox: { name: 'Pillbox', mod: 2 },
  tanktrap: { name: 'Anti-tank obstacles', mod: 1, line: true },
  sandbags: { name: 'Sandbag wall', mod: 1, line: true },
  searchlight: { name: 'Searchlights', mod: 0 },
  balloon: { name: 'Barrage balloons', mod: 1 },
  radar: { name: 'Radar station', mod: 0 },
  hq: { name: 'Field headquarters', mod: 1 },
  barracks: { name: 'Barracks', mod: 0 },
  depot: { name: 'Supply depot', mod: 0 },
  trucks: { name: 'Motor pool', mod: 0 },
  convoy: { name: 'Supply convoy', mod: 0, line: true },
  rail: { name: 'Railway and trains', mod: 0, line: true },
  hospital: { name: 'Field hospital', mod: 0 },
  roadblock: { name: 'Checkpoint', mod: 1 },
  bombers: { name: 'Bomber formation', mod: 0 },
  paratroopers: { name: 'Paratroopers', mod: 0 },
  cavalry: { name: 'Cavalry', mod: 0 },
  uboat: { name: 'Submarine', mod: 0 },
  navalmines: { name: 'Naval mines', mod: 1 },
  blockade: { name: 'Naval blockade', mod: 0, line: true },
  shipyard: { name: 'Shipyard', mod: 0 },
  radio: { name: 'Radio station', mod: 0 },
  embassy: { name: 'Embassy', mod: 0 },
  pow: { name: 'Prison camp', mod: 0 },
  riot: { name: 'Riot', mod: -1 },
  strike: { name: 'Labor strike', mod: 0 },
  refugees: { name: 'Refugee column', mod: 0, line: true },
  scorched: { name: 'Scorched earth', mod: 0 },
  rubble: { name: 'Bombed ruins', mod: 0 },
  flood: { name: 'Flooded land', mod: 1 },
};
export const MOD_STEP = 0.25; // each +1 in a feature or trait is worth +25% in battle

// Diplomatic relations on 3 September 1939. Shown on delegate screens; changed by effects.
export const START_RELATIONS = [
  { a: 'Germany', b: 'Poland', status: 'war' }, { a: 'Germany', b: 'United Kingdom', status: 'war' }, { a: 'Germany', b: 'France', status: 'war' },
  { a: 'United Kingdom', b: 'France', status: 'alliance' }, { a: 'United Kingdom', b: 'Poland', status: 'alliance' }, { a: 'France', b: 'Poland', status: 'alliance' },
  { a: 'Germany', b: 'Italy', status: 'alliance' }, // Pact of Steel, May 1939
  { a: 'Germany', b: 'USSR', status: 'pact' }, // Molotov-Ribbentrop Pact, 23 August 1939
];
export const RELATION_NAME = { war: 'At war', alliance: 'Allied', pact: 'Non-aggression pact', trade: 'Trade deal', tension: 'Tension' };
// Battle results by attack-to-defense ratio (shared by the staff calculator and automatic battles).
export const TIERS = [
  { min: 3, name: 'Decisive attacker victory', win: true, att: 0.1, def: 0.6 },
  { min: 2, name: 'Attacker victory', win: true, att: 0.15, def: 0.4 },
  { min: 1.5, name: 'Costly attacker victory', win: true, att: 0.25, def: 0.35 },
  { min: 0.8, name: 'Stalemate', win: false, att: 0.2, def: 0.2 },
  { min: 0, name: 'Attack fails', win: false, att: 0.35, def: 0.1 },
];

export const AI_VERSION = 8; // bump to redo assistant suggestions saved by older versions

// Game clock: the date runs on its own while the clock is going. 12 real hours take the war from
// 3 September 1939, 17:00 to 1 December 1941 (about 68 game days per real hour, a game day every 53 seconds).
export const CLOCK_START = Date.UTC(1939, 8, 3, 17, 0);
export const CLOCK_RATE = (Date.UTC(1941, 11, 1, 0, 0) - CLOCK_START) / (12 * 3600 * 1000);
export const gameTime = (c, now = Date.now()) => (!c ? CLOCK_START : c.running ? c.game + (now - c.at) * c.rate : c.game);
const DATE_FMT = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
export function gameDateText(ms, withTime = true) {
  const d = new Date(ms); const day = d.toLocaleDateString('en-US', DATE_FMT);
  return withTime ? `${day} · ${String(d.getUTCHours()).padStart(2, '0')}:00` : day;
}

// Real-world sizes behind each point of unit strength (rough 1939 averages): an infantry division's men,
// tanks in a tank division or brigade, 100 aircraft per air point, and a capital ship with its escorts per naval point.
export const MEN_PER = { 'Germany': 17000, 'Poland': 16000, 'France': 17000, 'United Kingdom': 13600, 'USSR': 14500, 'Italy': 13000, 'Finland': 14000, 'Japan': 18000, 'United States': 15000 };
export const TANKS_PER = { 'Germany': 300, 'Poland': 60, 'France': 220, 'United Kingdom': 300, 'USSR': 250, 'Italy': 150, 'Finland': 30, 'Japan': 100, 'United States': 250 };
export function realSize(u, str = u.str) {
  const k = u.kind, o = u.owner;
  if (k === 'army') return { n: str * (MEN_PER[o] || 15000), word: 'men' };
  if (k === 'armor') return { n: str * (TANKS_PER[o] || 200), word: 'tanks' };
  if (k === 'air') return { n: str * 100, word: 'aircraft' };
  return { n: str * 5, word: 'ships' };
}
const fmtN = (n) => n.toLocaleString('en-US');
const shortN = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmtN(n);
export const realText = (u, str) => { const r = realSize(u, str); return `${fmtN(r.n)} ${r.word}`; };
export const realShort = (u, str) => { const r = realSize(u, str); return `${shortN(r.n)} ${r.word === 'aircraft' ? 'planes' : r.word}`; };

// Cities that matter in 1939: where forces, factories and shipyards can be built, and what the city card shows.
// [name, lon, lat, country in 1939, flags (C capital, P port, M major, shown when zoomed out), what it is known for]
export const CITY_LIST = [
  ['London', -0.13, 51.5, 'United Kingdom', 'CPM', 'Capital of the British Empire and its largest port'],
  ['Birmingham', -1.9, 52.48, 'United Kingdom', 'M', 'Engineering, munitions and aircraft engines'],
  ['Coventry', -1.51, 52.41, 'United Kingdom', '', 'Aircraft engines and vehicle factories'],
  ['Manchester', -2.24, 53.48, 'United Kingdom', '', 'Textiles, engineering and aircraft'],
  ['Sheffield', -1.47, 53.38, 'United Kingdom', '', 'Steel and armor plate'],
  ['Liverpool', -2.98, 53.41, 'United Kingdom', 'P', 'Atlantic convoy port'],
  ['Glasgow', -4.25, 55.86, 'United Kingdom', 'PM', 'Clyde shipyards'],
  ['Newcastle', -1.61, 54.97, 'United Kingdom', 'P', 'Tyne shipyards and coal'],
  ['Belfast', -5.93, 54.6, 'United Kingdom', 'P', 'Harland and Wolff shipyard'],
  ['Portsmouth', -1.09, 50.8, 'United Kingdom', 'P', 'Royal Navy dockyard'],
  ['Plymouth', -4.14, 50.37, 'United Kingdom', 'P', 'Royal Navy base for the Western Approaches'],
  ['Paris', 2.35, 48.86, 'France', 'CM', 'Capital, rail hub and aircraft factories'],
  ['Lyon', 4.84, 45.76, 'France', 'M', 'Industry and silk'],
  ['Lille', 3.06, 50.63, 'France', '', 'Coal, steel and textiles near the Belgian border'],
  ['Metz', 6.18, 49.12, 'France', '', 'Fortress city behind the Maginot Line'],
  ['Strasbourg', 7.75, 48.58, 'France', '', 'On the Rhine, facing Germany'],
  ['Marseille', 5.37, 43.3, 'France', 'PM', 'Main Mediterranean port'],
  ['Toulon', 5.93, 43.12, 'France', 'P', 'French Mediterranean Fleet base'],
  ['Brest', -4.49, 48.39, 'France', 'P', 'French Atlantic Fleet base'],
  ['Le Havre', 0.11, 49.49, 'France', 'P', 'Channel port'],
  ['Bordeaux', -0.58, 44.84, 'France', 'P', 'Atlantic port'],
  ['Berlin', 13.4, 52.52, 'Germany', 'CM', 'Capital of the Reich'],
  ['Hamburg', 9.99, 53.55, 'Germany', 'PM', 'Largest port and Blohm and Voss shipyards'],
  ['Bremen', 8.8, 53.08, 'Germany', 'P', 'Port and shipyards'],
  ['Kiel', 10.13, 54.32, 'Germany', 'P', 'Navy base and U-boat yards'],
  ['Wilhelmshaven', 8.12, 53.52, 'Germany', 'P', 'North Sea naval base'],
  ['Stettin', 14.55, 53.43, 'Germany', 'P', 'Baltic port'],
  ['Königsberg', 20.5, 54.71, 'Germany', 'P', 'Capital of East Prussia'],
  ['Essen', 7.01, 51.46, 'Germany', 'M', 'Krupp steel and guns in the Ruhr'],
  ['Cologne', 6.96, 50.94, 'Germany', '', 'Rhine city and rail hub'],
  ['Munich', 11.58, 48.14, 'Germany', 'M', 'Birthplace of the Nazi Party; BMW engines'],
  ['Stuttgart', 9.18, 48.78, 'Germany', '', 'Daimler-Benz and Bosch factories'],
  ['Leipzig', 12.37, 51.34, 'Germany', '', 'Industry and rail hub'],
  ['Dresden', 13.74, 51.05, 'Germany', '', 'Industry on the Elbe'],
  ['Breslau', 17.04, 51.11, 'Germany', '', 'Silesian capital near Poland'],
  ['Vienna', 16.37, 48.21, 'Germany', 'M', 'Former Austrian capital, annexed in 1938'],
  ['Prague', 14.42, 50.08, 'Germany', 'M', 'Capital of the German Protectorate of Bohemia and Moravia'],
  ['Pilsen', 13.38, 49.75, 'Germany', '', 'Škoda arms works'],
  ['Danzig', 18.65, 54.35, 'Germany', 'PM', 'Free City, claimed by Germany on 1 September'],
  ['Warsaw', 21.0, 52.23, 'Poland', 'CM', 'Polish capital'],
  ['Kraków', 19.94, 50.06, 'Poland', 'M', 'Old royal capital in southern Poland'],
  ['Łódź', 19.46, 51.76, 'Poland', '', 'Textile industry'],
  ['Poznań', 16.93, 52.41, 'Poland', '', 'Western Poland'],
  ['Katowice', 19.02, 50.26, 'Poland', '', 'Upper Silesian coal and steel'],
  ['Lwów', 24.03, 49.84, 'Poland', 'M', 'Main city of southeastern Poland'],
  ['Wilno', 25.28, 54.69, 'Poland', '', 'Northeastern Poland'],
  ['Gdynia', 18.53, 54.52, 'Poland', 'P', 'Poland\'s only naval base'],
  ['Rome', 12.5, 41.9, 'Italy', 'CM', 'Italian capital'],
  ['Milan', 9.19, 45.46, 'Italy', 'M', 'Industry and banking'],
  ['Turin', 7.69, 45.07, 'Italy', '', 'Fiat factories'],
  ['Genoa', 8.93, 44.41, 'Italy', 'P', 'Port and Ansaldo shipyards'],
  ['La Spezia', 9.82, 44.1, 'Italy', 'P', 'Naval base'],
  ['Naples', 14.27, 40.85, 'Italy', 'P', 'Port and naval base'],
  ['Taranto', 17.24, 40.47, 'Italy', 'P', 'Main base of the Italian fleet'],
  ['Venice', 12.32, 45.44, 'Italy', 'P', 'Adriatic port'],
  ['Trieste', 13.77, 45.65, 'Italy', 'P', 'Adriatic port and shipyards'],
  ['Tripoli', 13.19, 32.89, 'Italy', 'P', 'Capital of Italian Libya'],
  ['Moscow', 37.6, 55.75, 'USSR', 'CM', 'Soviet capital'],
  ['Leningrad', 30.3, 59.94, 'USSR', 'PM', 'Baltic Fleet base and heavy industry'],
  ['Murmansk', 33.08, 68.97, 'USSR', 'P', 'Ice-free Arctic port'],
  ['Minsk', 27.56, 53.9, 'USSR', '', 'Capital of Soviet Belarus'],
  ['Kiev', 30.52, 50.45, 'USSR', 'M', 'Capital of Soviet Ukraine'],
  ['Kharkov', 36.23, 49.99, 'USSR', '', 'Tank and tractor factories'],
  ['Odessa', 30.73, 46.48, 'USSR', 'P', 'Black Sea port'],
  ['Sevastopol', 33.52, 44.62, 'USSR', 'P', 'Black Sea Fleet base'],
  ['Stalingrad', 44.51, 48.71, 'USSR', 'M', 'Tractor plant on the Volga'],
  ['Gorky', 44.0, 56.33, 'USSR', '', 'Automobile factory'],
  ['Sverdlovsk', 60.6, 56.84, 'USSR', '', 'Ural heavy industry'],
  ['Vladivostok', 131.9, 43.12, 'USSR', 'P', 'Pacific Fleet base'],
  ['Helsinki', 24.94, 60.17, 'Finland', 'CPM', 'Finnish capital and port'],
  ['Turku', 22.27, 60.45, 'Finland', 'P', 'Port and shipyard'],
  ['Viipuri', 28.74, 60.71, 'Finland', '', 'Karelian city near the Soviet border'],
  ['Tokyo', 139.7, 35.7, 'Japan', 'CM', 'Japanese capital'],
  ['Yokosuka', 139.67, 35.28, 'Japan', 'P', 'Naval base'],
  ['Osaka', 135.5, 34.69, 'Japan', 'PM', 'Industry and port'],
  ['Kure', 132.57, 34.25, 'Japan', 'P', 'Naval base and battleship yard'],
  ['Nagasaki', 129.87, 32.75, 'Japan', 'P', 'Mitsubishi shipyard'],
  ['Washington', -77.04, 38.9, 'United States', 'CM', 'American capital'],
  ['New York', -74.0, 40.71, 'United States', 'PM', 'Largest city and port'],
  ['Detroit', -83.05, 42.33, 'United States', 'M', 'Car factories'],
  ['Pittsburgh', -79.99, 40.44, 'United States', '', 'Steel'],
  ['Norfolk', -76.29, 36.85, 'United States', 'P', 'Atlantic Fleet base'],
  ['San Diego', -117.16, 32.72, 'United States', 'P', 'Pacific naval base'],
  ['Seattle', -122.33, 47.61, 'United States', 'P', 'Boeing aircraft and shipyards'],
  ['Pearl Harbor', -157.95, 21.36, 'United States', 'P', 'Pacific Fleet anchorage in Hawaii'],
  ['Brussels', 4.35, 50.85, 'Belgium', 'CM', 'Belgian capital, neutral'],
  ['Amsterdam', 4.9, 52.37, 'Netherlands', 'CPM', 'Dutch capital, neutral'],
  ['Rotterdam', 4.48, 51.92, 'Netherlands', 'P', 'Major neutral port'],
  ['Copenhagen', 12.57, 55.68, 'Denmark', 'CP', 'Danish capital, neutral'],
  ['Oslo', 10.75, 59.91, 'Norway', 'CP', 'Norwegian capital, neutral'],
  ['Stockholm', 18.07, 59.33, 'Sweden', 'CPM', 'Swedish capital, neutral; iron ore exports'],
  ['Madrid', -3.7, 40.42, 'Spain', 'CM', 'Spanish capital, neutral after the civil war'],
  ['Lisbon', -9.14, 38.72, 'Portugal', 'CP', 'Portuguese capital, neutral port'],
  ['Budapest', 19.04, 47.5, 'Hungary', 'CM', 'Hungarian capital'],
  ['Bucharest', 26.1, 44.43, 'Romania', 'CM', 'Romanian capital'],
  ['Ploiești', 26.02, 44.94, 'Romania', '', 'Oil fields and refineries'],
  ['Belgrade', 20.46, 44.79, 'Yugoslavia', 'C', 'Yugoslav capital'],
  ['Athens', 23.73, 37.98, 'Greece', 'C', 'Greek capital'],
  ['Istanbul', 28.98, 41.01, 'Turkey', 'PM', 'Guards the Bosporus straits'],
  ['Ankara', 32.86, 39.93, 'Turkey', 'C', 'Turkish capital'],
];
export const CITY = Object.fromEntries(CITY_LIST.map(([name, lon, lat, country, flags, note]) => [name, { name, at: [lon, lat], country, capital: flags.includes('C'), port: flags.includes('P'), major: flags.includes('M') || flags.includes('C'), note }]));
export const cityNamed = (t) => CITY[t] || Object.values(CITY).find((c) => c.name.toLowerCase() === String(t || '').trim().toLowerCase()) || null;
export const nearestCity = (at, maxDeg = 99) => { let best = null, bd = maxDeg; for (const c of Object.values(CITY)) { const d = Math.hypot(c.at[0] - at[0], c.at[1] - at[1]); if (d < bd) { bd = d; best = c; } } return best; };
