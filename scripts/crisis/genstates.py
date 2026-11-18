# Inputs (put in <scratch>): hb/w1938.geojson (github.com/aourednik/historical-basemaps, GPL-3.0), hb/adm1.geojson and ne/pp.geojson
# (Natural Earth admin-1 and populated places, public domain), ne/cities.json (CITY_LIST from scenario.js), genregions.py (OLDNAME table).
# HOI4-style states for the September 1938 map.
# Borders: historical-basemaps world_1938 (drawn after Munich), with Czechoslovakia put back to its pre-Munich
# frontier using today's Czech, Slovak and Zakarpattia outlines. Danzig is added as a Free City.
# States: Natural Earth admin-1 provinces clipped to the 1938 countries, merged or split to a HOI4-like size,
# with historical areas (Sudetenland, Vienna Awards, Bessarabia, Memel, warlord China...) kept as their own states.
# Usage: python3 -I genstates.py <repo> <scratch>
import json, re, sys, math, unicodedata, collections
import numpy as np
from scipy.cluster.vq import kmeans2
from shapely.geometry import shape, Polygon, MultiPolygon, Point, MultiPoint, box, mapping
from shapely.ops import unary_union, voronoi_diagram
from shapely.validation import make_valid
from shapely.strtree import STRtree

repo, scr = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(11)
W38 = json.load(open(f'{scr}/hb/w1938.geojson'))['features']
ADM = json.load(open(f'{scr}/hb/adm1.geojson'))['features']
PP = [f['properties'] for f in json.load(open(f'{scr}/ne/pp.geojson'))['features']]
CITIES = json.load(open(f'{scr}/ne/cities.json'))
src = open(f'{scr}/genregions.py').read()
OLDNAME = eval(re.search(r'^OLDNAME = (\{.*?\})\n\n', src, re.S | re.M).group(1))
OLDNAME.update({'Opava': 'Troppau', 'Cheb': 'Eger', 'Most': 'Brüx', 'Teplice': 'Teplitz', 'Děčín': 'Tetschen', 'Jablonec nad Nisou': 'Gablonz', 'Trutnov': 'Trautenau', 'Šumperk': 'Mährisch Schönberg', 'Znojmo': 'Znaim', 'Český Krumlov': 'Krummau', 'Olsztyn': 'Allenstein', 'Elbląg': 'Elbing', 'Ełk': 'Lyck', 'Malbork': 'Marienburg', 'Kwidzyn': 'Marienwerder', 'Giżycko': 'Lötzen', 'Gdańsk': 'Danzig', 'Lviv': 'Lwów', 'Hrodna': 'Grodno', 'Vitebsk': 'Vitebsk', 'Minsk': 'Minsk', 'Brest': 'Brest-Litovsk', 'Rivne': 'Równe', 'Volyn': 'Wołyń',
  'Ternopil': 'Tarnopol', 'Ivano-Frankivsk': 'Stanisławów', 'Chernivtsi': 'Czernowitz', 'Klaipėda': 'Memel', 'Vilnius': 'Wilno', 'Kaliningrad': 'Königsberg',
  'Pomeranian': 'Pomorze', 'West Pomeranian': 'Pomerania', 'Lower Silesian': 'Lower Silesia', 'Opole': 'Upper Silesia', 'Lubusz': 'Neumark', 'Warmian-Masurian': 'Masuria',
  'Greater Poland': 'Poznań', 'Kuyavian-Pomeranian': 'Kujawy', 'Masovian': 'Masovia', 'Lesser Poland': 'Kraków', 'Silesian': 'Silesia', 'Łódź': 'Łódź',
  'Lublin': 'Lublin', 'Podlaskie': 'Białystok', 'Holy Cross': 'Kielce', 'Subcarpathian': 'Rzeszów', 'Saint Petersburg': 'Leningrad', 'Nizhny Novgorod': 'Gorky',
  'Samara': 'Kuibyshev', 'Sverdlovsk': 'Sverdlovsk', 'Tver': 'Kalinin', 'Volgograd': 'Stalingrad', 'Kyiv': 'Kiev', 'Kharkiv': 'Kharkov', 'Odessa': 'Odessa',
  'Dnipropetrovsk': 'Dnepropetrovsk', 'Donetsk': 'Stalino', 'Luhansk': 'Voroshilovgrad', 'Zaporizhzhia': 'Zaporozhye', 'Mykolaiv': 'Nikolayev',
  'Vinnytsia': 'Vinnitsa', 'Zhytomyr': 'Zhitomir', 'Chernihiv': 'Chernigov', 'Kirovohrad': 'Kirovograd', 'Khmelnytskyi': 'Kamenets-Podolsky',
  'Bavaria': 'Bavaria', 'Saxony': 'Saxony', 'North Rhine-Westphalia': 'Rhineland-Westphalia', 'Lower Saxony': 'Hanover', 'Mecklenburg-Vorpommern': 'Mecklenburg',
  'Saxony-Anhalt': 'Prussian Saxony', 'Schleswig-Holstein': 'Schleswig-Holstein', 'Rhineland-Palatinate': 'Palatinate', 'Baden-Württemberg': 'Baden-Württemberg',
  'Lower Austria': 'Lower Danube', 'Upper Austria': 'Upper Danube', 'Ústí nad Labem': 'Aussig', 'Liberec': 'Reichenberg', 'Karlovy Vary': 'Egerland',
  'Plzeň-': 'Pilsen', 'South Bohemian': 'South Bohemia', 'Hradec Králové': 'Hradec Králové', 'Moravian-Silesian': 'Ostrava', 'South Moravian': 'Brno',
  'Central Bohemian': 'Central Bohemia', 'Vysočina': 'Jihlava', 'Zlín': 'Zlín', 'Olomouc': 'Olomouc', 'Pardubice': 'Pardubice', 'Prague': 'Prague',
  'Zakarpattia': 'Carpatho-Ukraine', 'Istanbul': 'Istanbul', 'Izmir': 'Smyrna', 'Ankara': 'Ankara'})
DROPWORDS = re.compile(r'\b(Prefecture|Province|Voivodeship|Region|Oblast|County|Governorate|Department|Municipality|Autonomous|Republic of|Krai)\b', re.I)

def mv(g): return make_valid(g) if not g.is_valid else g
def clean_name(n):
    if n == 'Yemen (UK)': return 'Aden'
    return _clean_name(n)
def _clean_name(n): return re.sub(r'\s*\((France|GB|Italy|Portugal|Belgium|British Raj)\)\s*$', '', n or '').strip()
def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')
def polys(g):
    if g is None or g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)] + [q for p in getattr(g, 'geoms', []) if not isinstance(p, Polygon) for q in polys(p)]
def area(g): return 0 if g is None else g.area

SOV = {'Spain': 'Nationalist Spain', 'United Kingdom of Great Britain and Ireland': 'United Kingdom', 'Empire of Japan': 'Japan', 'Chinese warlords': 'Nationalist China', 'Xinjiang': 'Sinkiang'}
OWN_FIX = {'Cambodia': 'France', 'Cochin China': 'France', 'Mesopotamia': 'Iraq', 'Mandatory Palestine': 'United Kingdom', 'Armenia': 'USSR',
  'Egypt': 'Egypt', 'Hong Kong': 'United Kingdom', 'Libya': 'Italy', 'Tunisia': 'France', 'Laos': 'France', 'Togo': 'France', 'French Guiana': 'France',
  'French Somaliland': 'France', 'Guadeloupe': 'France', 'Martinique': 'France', 'Hail': 'Saudi Arabia', 'Hejaz': 'Saudi Arabia', "Emirate of Bin Shal'an": 'Saudi Arabia',
  'India': 'United Kingdom', 'Israel': 'United Kingdom', 'Ceylon': 'United Kingdom', 'Dominion of Newfoundland': 'United Kingdom', 'Malawi': 'United Kingdom',
  'Gambia, The': 'United Kingdom', 'Belize': 'United Kingdom', 'Bahamas': 'United Kingdom', 'Jamaica': 'United Kingdom', 'Trinidad': 'United Kingdom', 'Guyana': 'United Kingdom',
  'Sudan': 'United Kingdom', 'Brunei': 'United Kingdom', 'Fiji': 'United Kingdom', 'Aden': 'United Kingdom', 'Suriname': 'Netherlands', 'Netherlands Antilles': 'Netherlands',
  'Puerto Rico': 'United States', 'Guinea-Bissau': 'Portugal', 'Burundi': 'Belgium', 'Rwanda': 'Belgium', 'Rio De Oro': 'Nationalist Spain', 'Spanish Sahara': 'Nationalist Spain',
  'Equatorial Guinea': 'Nationalist Spain', 'Samoa': 'New Zealand', 'Saipan': 'Japan', 'Yemen': 'Yemen'}
GEOJ = json.load(open(f'{repo}/public/crisis/geo.json'))

# ---------- 1938 countries ----------
C = collections.OrderedDict(); OWN = {}
for f in W38:
    if not f['geometry']: continue
    n = clean_name(f['properties']['NAME']); s = f['properties']['SUBJECTO'] or n
    if not n: continue
    g = mv(shape(f['geometry']))
    C[n] = mv(unary_union([C[n], g])) if n in C else g
    OWN[n] = OWN_FIX.get(n) or GEOJ['wsub'].get(n) or SOV.get(s, s)
admin = collections.defaultdict(list)
for f in ADM:
    p = f['properties']; g = mv(shape(f['geometry'])); admin[p['admin']].append((p, g))
def adm_union(admins, names=None):
    out = []
    for a in admins:
        for p, g in admin[a]:
            if names is None or p['name_en'] in names or p['name'] in names: out.append(g)
    return mv(unary_union(out)) if out else Polygon()
CZ_now = adm_union(['Czech Republic']); SK_now = adm_union(['Slovakia']); ZAK = adm_union(['Ukraine'], {'Zakarpattia'})
CZSK = mv(unary_union([CZ_now, SK_now, ZAK]))
sudeten = mv(C['Germany'].intersection(CZ_now.buffer(0)))
zaolzie = mv(C['Poland'].intersection(CZSK))
vienna = mv(C['Hungary'].intersection(CZSK))
petrz = mv(C['Germany'].intersection(SK_now))
for k, piece in [('Germany', unary_union([sudeten, petrz])), ('Poland', zaolzie), ('Hungary', vienna)]:
    C[k] = mv(C[k].difference(piece))
C['Czechoslovakia'] = mv(unary_union([C['Czechoslovakia'], sudeten, petrz, zaolzie, vienna]))
# East Prussia is drawn too small in the source: rebuild it from Kaliningrad, Warmia-Masuria and the land east of the Vistula.
land_pl = adm_union(['Poland'])
ep = mv(unary_union([adm_union(['Russia'], {'Kaliningrad'}), adm_union(['Poland'], {'Warmian-Masurian'}), land_pl.intersection(box(18.95, 53.6, 19.7, 54.5))]))
ep = mv(ep.difference(box(19.9, 53.1, 20.7, 53.33)))  # Soldau stayed Polish after 1920
# Danzig: the gap the dataset leaves around the city, without Gdynia and the Hel peninsula (Polish).
allc = unary_union(list(C.values()))
gap = mv(land_pl.intersection(box(18.25, 53.95, 19.65, 54.62)).difference(allc))
danzig = mv(gap.difference(box(18.0, 54.43, 18.565, 54.95)).difference(box(18.4, 54.58, 18.95, 54.95)).difference(ep))
danzig = unary_union([p for p in polys(danzig) if p.area > 0.002])
C['Poland'] = mv(unary_union([C['Poland'], mv(gap.difference(danzig).difference(ep))]).difference(ep))
C['Germany'] = mv(unary_union([C['Germany'], ep.difference(danzig)]))
if danzig.area > 0.03: C['Danzig'] = danzig; OWN['Danzig'] = 'Danzig'
print('danzig area', round(danzig.area, 3), file=sys.stderr)

# ---------- Special areas: (country, area, geometry, owner, zone) ----------
def A(country, name, geom, owner=None, zone=None): return [country, name, geom, owner, zone]
ro = C['Romania']; SPECIAL = []
SPECIAL += [A('Czechoslovakia', 'Sudetenland', sudeten, None, 'Border'), A('Czechoslovakia', 'Zaolzie', zaolzie, None, 'North'),
  A('Czechoslovakia', 'First Vienna Award (Slovakia)', vienna.intersection(SK_now), None, 'South'),
  A('Czechoslovakia', 'First Vienna Award (Ruthenia)', vienna.intersection(ZAK), None, 'East'),
  A('Czechoslovakia', 'Carpatho-Ukraine', ZAK.difference(vienna), None, 'East'),
  A('Czechoslovakia', 'Slovakia', SK_now.difference(vienna).difference(zaolzie), None, 'East'),
  A('Czechoslovakia', 'Moravia', adm_union(['Czech Republic'], {'Olomouc', 'Moravian-Silesian', 'South Moravian', 'Zlín'}).difference(sudeten).difference(zaolzie), None, 'Central'),
  A('Czechoslovakia', 'Bohemia', CZ_now.difference(sudeten), None, 'West')]
SPECIAL += [A('Romania', 'Northern Transylvania', adm_union(['Romania'], {'Satu Mare', 'Bihor', 'Maramureș', 'Sălaj', 'Cluj', 'Bistrița-Năsăud', 'Mureș', 'Harghita', 'Covasna'}), None, 'North'),
  A('Romania', 'Southern Dobruja', adm_union(['Bulgaria'], {'Dobrich', 'Silistra'}), None, 'South'),
  A('Romania', 'Bessarabia', unary_union([adm_union(['Moldova']), adm_union(['Ukraine'], {'Odessa'})]), None, 'East'),
  A('Romania', 'Northern Bukovina', adm_union(['Ukraine'], {'Chernivtsi'}), None, 'North')]
SPECIAL += [A('Lithuania', 'Memel Territory', adm_union(['Lithuania'], {'Klaipėda'}), None, 'West')]
SPECIAL += [A('Poland', 'Eastern Poland (Kresy)', unary_union([adm_union(['Belarus']), adm_union(['Ukraine']), adm_union(['Lithuania'])]), None, 'East')]
SPECIAL += [A('Germany', 'Austria', adm_union(['Austria']), None, 'South'), A('Germany', 'East Prussia', ep, None, 'East')]
SPECIAL += [A('Finland', 'Finnish Karelia', adm_union(['Russia']), None, 'East')]
SPECIAL += [A('France', 'Alsace-Lorraine', adm_union(['France'], {'Bas-Rhin', 'Haut-Rhin', 'Moselle'}), None, 'East')]
for ssr, ar in [('Ukraine', 'Ukrainian SSR'), ('Belarus', 'Byelorussian SSR'), ('Georgia', 'Transcaucasia'), ('Armenia', 'Transcaucasia'), ('Azerbaijan', 'Transcaucasia'),
                ('Kazakhstan', 'Kazakh SSR'), ('Uzbekistan', 'Central Asia'), ('Turkmenistan', 'Central Asia'), ('Kyrgyzstan', 'Central Asia'), ('Tajikistan', 'Central Asia')]:
    SPECIAL.append(A('USSR', ar, adm_union([ssr])))
SPECIAL.append(A('Armenia', 'Transcaucasia', adm_union(['Armenia'])))
# Spain in September 1938: provinces held by the Republic; the rest by the Nationalists.
REP = {'Barcelona', 'Girona', 'Tarragona', 'Community of Madrid', 'Valencia', 'Alicante', 'Murcia', 'Albacete', 'Almería', 'Jaén', 'Ciudad Real', 'Cuenca', 'Guadalajara'}
SPECIAL += [A('Spain', 'Republican Spain', adm_union(['Spain'], REP), 'Spanish Republic', 'East')]
# China in September 1938.
CH = lambda *n: adm_union(['China'], set(n))
SPECIAL += [A('Chinese warlords', 'Japanese-occupied China', CH('Beijing', 'Tianjin', 'Hebei', 'Shandong', 'Jiangsu', 'Shanghai'), 'Japan', 'North'),
  A('Chinese warlords', 'Shanxi', CH('Shanxi'), 'Shanxi', 'North'), A('Chinese warlords', 'Guangxi', CH('Guangxi'), 'Guangxi', 'South'),
  A('Chinese warlords', 'Yunnan', CH('Yunnan'), 'Yunnan', 'South'),
  A('Chinese warlords', 'Xibei San Ma', unary_union([CH('Qinghai', 'Ningxia', 'Gansu'), CH('Inner Mongolia').intersection(box(90, 30, 107, 50))]), 'Xibei San Ma', 'West'),
  A('Chinese warlords', 'Shaan-Gan-Ning', CH('Shaanxi').intersection(box(100, 36.0, 115, 45)), 'Communist China', 'North'),
  A('Chinese warlords', 'Mengjiang', CH('Inner Mongolia').intersection(box(107, 30, 117.5, 50)), 'Mengjiang', 'North'),
  A('Empire of Japan', 'Manchuria', unary_union([CH('Heilongjiang', 'Jilin', 'Liaoning', 'Inner Mongolia', 'Hebei')]), 'Manchukuo', 'West'),
  A('Empire of Japan', 'Korea', unary_union([adm_union(['South Korea']), adm_union(['North Korea'])]), None, 'Korea'),
  A('Empire of Japan', 'Taiwan', adm_union(['Taiwan']), None, 'South'), A('Empire of Japan', 'Karafuto', adm_union(['Russia']), None, 'North')]

# ---------- How many states per country ----------
DES = {'Libya': .3, 'Algeria': .3, 'Egypt': .45, 'Saudi Arabia': .3, 'Hejaz': .35, 'Hail': .35, "Emirate of Bin Shal'an": .35, 'Muscat and Oman': .35, 'Trucial Oman': .4,
  'Rio De Oro': .3, 'Spanish Sahara': .3, 'French West Africa': .25, 'Mesopotamia': .6, 'Iran': .5, 'Syria': .7, 'Afghanistan': .5, 'Morocco': .75, 'Tunisia': .8,
  'Sweden': .75, 'Norway': .75, 'Finland': .85, 'Xinjiang': .35, 'Tibet': .3, 'Mongolia': .3, 'Canada': .5, 'Australia': .5, 'Sudan': .35, 'British Raj': .55, 'India': .55, 'Denmark': .3, 'French Equatorial Africa': .45, 'Belgian Congo': .6, 'French West Africa': .5}
def target(name, g):
    ctr = g.representative_point(); lo, la = ctr.x, ctr.y; a = sum(p.area * math.cos(math.radians(p.representative_point().y)) for p in polys(g)) / math.cos(math.radians(50))
    if -25 < lo < 45 and 34 < la < 72: f = 1.0
    elif 70 < lo < 150 and 15 < la < 55: f = 0.8
    elif -20 < lo < 65 and 10 < la < 45: f = 0.5
    else: f = 0.18
    if name == 'USSR': f = 0.75
    f *= DES.get(name, 1)
    return max(1, min(170, round(28 * (a / 60) ** 0.7 * f)))

# ---------- Building blocks inside an area ----------
admtree_g = [g for a in admin for p, g in admin[a]]; admtree_p = [(a, p) for a in admin for p, g in admin[a]]
TREE = STRtree(admtree_g)
def pieces_of(geom):
    out = []
    for i in TREE.query(geom):
        g = admtree_g[i]
        if not g.intersects(geom): continue
        x = mv(g.intersection(geom))
        for p in polys(x):
            if p.area > 1e-5: out.append({'g': p, 'adm': admtree_p[i], 'frac': p.area / max(g.area, 1e-9)})
    # Leftovers (coastline differences) join the nearest piece.
    if out:
        rest = mv(geom.difference(unary_union([o['g'] for o in out]).buffer(0)))
        for p in polys(rest):
            if p.area < 1e-5: continue
            best = min(out, key=lambda o: o['g'].distance(p)); best['g'] = mv(unary_union([best['g'], p]))
    else:
        out = [{'g': p, 'adm': None, 'frac': 0} for p in polys(geom) if p.area > 1e-5]
    # Merge tiny islands of the same province.
    merged = collections.OrderedDict()
    for o in out:
        k = (o['adm'][0], o['adm'][1]['name_en']) if o['adm'] else ('', id(o))
        if k in merged: merged[k]['g'] = mv(unary_union([merged[k]['g'], o['g']])); merged[k]['frac'] += o['frac']
        else: merged[k] = o
    out = list(merged.values())
    # Slivers from a neighboring modern country (border data differences) join the block they touch most.
    if len(out) > 1:
        tot = sum(o['g'].area for o in out); avg = tot / len(out); owner_adm = collections.Counter()
        for o in out:
            if o['adm']: owner_adm[o['adm'][0]] += o['g'].area
        home = owner_adm.most_common(1)[0][0] if owner_adm else None
        small = [o for o in out if o['g'].area < 0.25 * avg and (o['frac'] < 0.5 or (o['adm'] and o['adm'][0] != home))]
        keep = [o for o in out if o not in small]
        if keep:
            for o in small:
                tgt = max(keep, key=lambda k: k['g'].buffer(0.02).intersection(o['g'].buffer(0.02)).area - k['g'].distance(o['g']))
                tgt['g'] = mv(unary_union([tgt['g'], o['g']]))
            out = keep
    return out

def cluster(blocks, k):
    if len(blocks) <= k: return [[b] for b in blocks]
    pts = np.array([[b['g'].representative_point().x * math.cos(math.radians(b['g'].representative_point().y)), b['g'].representative_point().y] for b in blocks])
    w = np.array([max(b['g'].area, 1e-4) for b in blocks])
    rep = np.repeat(pts, np.clip((w / w.min()).astype(int), 1, 40), axis=0)
    cent, _ = kmeans2(rep, k, seed=7, minit='++', iter=40)
    lab = np.argmin(((pts[:, None, :] - cent[None, :, :]) ** 2).sum(-1), axis=1)
    groups = collections.defaultdict(list)
    for b, l in zip(blocks, lab): groups[l].append(b)
    return list(groups.values())

def split(g, n):
    if n <= 1 or g.area < 0.05: return [g]
    minx, miny, maxx, maxy = g.bounds; pts = []
    while len(pts) < n * 30:
        for x, y in zip(rng.uniform(minx, maxx, 3000), rng.uniform(miny, maxy, 3000)):
            if g.contains(Point(x, y)): pts.append((x * math.cos(math.radians(y)), y))
        if minx == maxx: break
    cent, _ = kmeans2(np.array(pts), n, seed=7, minit='++', iter=30)
    vd = voronoi_diagram(MultiPoint([(cx / math.cos(math.radians(cy)), cy) for cx, cy in cent]), envelope=box(*g.buffer(2).bounds))
    return [x for c in vd.geoms for x in [mv(c.intersection(g))] if not x.is_empty and x.area > 1e-4]

PLACES = [(p['longitude'], p['latitude'], p['pop_max'] or 0, re.sub(r'\s+', ' ', p['name']).strip(), p.get('adm0name') or '') for p in PP]
PT = STRtree([Point(x, y) for x, y, _, _, _ in PLACES])
CAN = lambda t: {'czechia': 'czech republic', 'russian federation': 'russia'}.get((t or '').lower(), (t or '').lower())
NE_NAME = {'Czech Republic': 'Czechia', 'Russia': 'Russia', 'United States of America': 'United States of America'}
def town_in(g, used, country=None, mods=None):
    cand = [(1e9, c['name']) for c in CITIES if g.contains(Point(*c['at'])) and (country is None or c.get('country') in (country, LABEL.get(country), 'USSR' if country == 'USSR' else None))]
    for i in PT.query(g):
        x, y, pop, nm, a0 = PLACES[i]
        if mods is not None and CAN(a0) not in {CAN(m) for m in mods}: continue
        if g.contains(Point(x, y)): cand.append((pop, nm))
    for pop, nm in sorted(cand, reverse=True):
        nm = OLDNAME.get(nm, nm)
        if nm and nm not in used: return nm
    return None
def adm_label(p):
    n = p['name_en'] or p['name'] or ''; n = DROPWORDS.sub('', n).replace('  ', ' ').strip(' -'); n = OLDNAME.get(n) or n
    return n
def around(g, used, mods):
    c = g.representative_point(); best = []
    for i in PT.query(g.buffer(3)):
        x, y, pop, nm, a0 = PLACES[i]
        if pop < 3000 or (mods and CAN(a0) not in {CAN(m) for m in mods}): continue
        best.append((math.hypot(x - c.x, y - c.y), OLDNAME.get(nm) or nm))
    for d, nm in sorted(best):
        if f'Around {nm}' not in used: return f'Around {nm}'
    return None
def compass(c, ref):
    dx, dy = c.x - ref.x, c.y - ref.y
    if math.hypot(dx, dy) < 0.5: return 'Central'
    return ['Eastern', 'Northeastern', 'Northern', 'Northwestern', 'Western', 'Southwestern', 'Southern', 'Southeastern'][int(((math.degrees(math.atan2(dy, dx)) % 360) + 22.5) // 45) % 8]
ZW = {'Eastern': 'East', 'Northeastern': 'Northeast', 'Northern': 'North', 'Northwestern': 'Northwest', 'Western': 'West', 'Southwestern': 'Southwest', 'Southern': 'South', 'Southeastern': 'Southeast', 'Central': 'Central'}
LABEL = {'USSR': 'Soviet Union', 'United Kingdom': 'Britain', 'Chinese warlords': 'China', 'Empire of Japan': 'Japan'}

AREA_N = {'Sudetenland': 5, 'Bohemia': 4, 'Slovakia': 4, 'Moravia': 2}
def sudeten_name(c):
    if c.y < 49.35: return 'Bohemian Forest' if c.x < 15.3 else 'South Moravia (Znaim)'
    if c.x < 13.6: return 'Egerland'
    if c.x < 14.9: return 'Aussig'
    if c.x < 16.2: return 'Reichenberg'
    return 'Sudeten Silesia'
HOMEADM = {'France': 'France', 'United Kingdom': 'United Kingdom', 'Spain': 'Spain', 'Italy': 'Italy', 'Empire of Japan': 'Japan', 'USSR': 'Russia', 'Turkey': 'Turkey', 'Sweden': 'Sweden', 'Norway': 'Norway', 'Greece': 'Greece', 'Portugal': 'Portugal'}
states, ids = [], set()
for country, G in C.items():
    if G.area < 2e-4: continue
    owner0 = OWN.get(country, country)
    used = set(); ref = G.representative_point(); N = target(country, G)
    areas = []; taken = []
    for sc in [s for s in SPECIAL if s[0] == country]:
        geom = mv(sc[2].intersection(G)).difference(unary_union(taken)) if taken else mv(sc[2].intersection(G))
        geom = mv(geom)
        if geom.area < 2e-4: continue
        taken.append(geom); areas.append((sc[1], sc[3] or owner0, sc[4], geom, True))
    rest = mv(G.difference(unary_union(taken))) if taken else G
    # A small leftover next to special areas joins the special area it touches most, instead of becoming its own state.
    if taken and rest.area < 0.4 * G.area / N and areas:
        k = max(range(len(areas)), key=lambda i: areas[i][3].buffer(0.03).intersection(rest).area)
        an0, ow0, z0, g0, sp0 = areas[k]; areas[k] = (an0, ow0, z0, mv(unary_union([g0, rest])), sp0); rest = Polygon()
    if rest.area > 2e-4: areas.append((None, owner0, None, rest, False))
    total = sum(a[3].area for a in areas)
    for an, own, zone, geom, special in areas:
        n = AREA_N.get(an) or max(1, round(N * geom.area / total))
        blocks = pieces_of(geom)
        if not blocks: continue
        groups = cluster(blocks, n)
        # Too few provinces for the size: split the biggest ones.
        outs = []
        for grp in groups:
            g = mv(unary_union([b['g'] for b in grp]))
            whole = len(grp) == 1 and grp[0]['adm'] and grp[0]['frac'] > 0.75
            outs.append((g, adm_label(grp[0]['adm'][1]) if whole else None, grp))
        while len(outs) < n:
            outs.sort(key=lambda o: -o[0].area); g0, nm0, grp0 = outs.pop(0)
            parts = split(g0, 2 if len(outs) + 2 <= n else 2)
            if len(parts) < 2: outs.append((g0, nm0, grp0)); break
            for p in parts: outs.append((p, None, grp0))
        for g, nm, grp in outs:
            # Area label for ordinary land: the province's region field, or the compass direction in the country.
            if an: area_name = an
            else:
                regs = collections.Counter()
                for b in grp:
                    if b['adm'] and b['adm'][1].get('region') and b['adm'][0] == HOMEADM.get(country) and b['adm'][0] in ('France', 'United Kingdom', 'Spain', 'Italy', 'Japan', 'Russia', 'Turkey', 'Sweden', 'Norway', 'Greece', 'Portugal'):
                        regs[b['adm'][1]['region']] += b['g'].area
                d = compass(g.representative_point(), ref)
                area_name = regs.most_common(1)[0][0] if regs else (LABEL.get(country, country) if N <= 3 else f"{d} {LABEL.get(country, country)}" if d != 'Central' else f"Central {LABEL.get(country, country)}")
            if an and len(outs) == 1: nm = an
            if an == 'Sudetenland': nm = sudeten_name(g.representative_point())
            if not an and len(areas) == 1 and len(outs) == 1: nm = LABEL.get(country, country)
            mods = {b['adm'][0] for b in grp if b['adm'] and b['g'].area > 0.1 * g.area}
            if len(C) and country in ('Danzig',): nm = 'Free City of Danzig'
            nm = nm or town_in(g, used, country, mods) or around(g, used, mods) or f"{compass(g.representative_point(), ref)} {area_name}"
            base = nm; i2 = 2
            while nm in used: nm = f'{base} {i2}'; i2 += 1
            used.add(nm)
            sid = f'{slug(country)}-{slug(nm)}'; j2 = 2
            while sid in ids: sid = f'{slug(country)}-{slug(nm)}-{j2}'; j2 += 1
            ids.add(sid); c = g.representative_point()
            states.append({'id': sid, 'name': nm, 'country': country, 'owner': own, 'area': area_name, 'zone': zone or ZW[compass(c, ref)], 'c': [round(c.x, 2), round(c.y, 2)], 'g': g})

print('states', len(states), file=sys.stderr)
cnt = collections.Counter(s['country'] for s in states)
print(cnt.most_common(30), file=sys.stderr)

# ---------- Shapes, neighbors, output ----------
EU = box(-30, 25, 65, 75)
def rings(g, pre=None):
    g = pre if pre is not None else g.simplify(0.015 if g.intersects(EU) else 0.04, preserve_topology=True); out = []
    for p in polys(g):
        if p.area < 1e-4: continue
        for r in [p.exterior, *p.interiors]:
            cs = [[round(x, 2), round(y, 2)] for x, y in r.coords]
            if len(cs) >= 4: out.append(cs)
    return out
EU = box(-30, 25, 65, 75)
# Simplify all states together so neighbors keep exactly the same shared edges (no slivers or slits between them).
import shapely
raw = [mv(st['g']) for st in states]
try:
    # Europe and the Near East a little finer; the rest of the world coarser (smaller download).
    simp_fine = shapely.coverage_simplify(np.array(raw, dtype=object), 0.02)
    simp_coarse = shapely.coverage_simplify(np.array(raw, dtype=object), 0.07)
    for st, gf, gc in zip(states, simp_fine, simp_coarse):
        g = gf if st['g'].intersects(EU) else gc
        if g is not None and not g.is_empty: st['gs'] = mv(g)
except Exception as e:
    print('coverage_simplify failed', e, file=sys.stderr)
gs = [s['g'].buffer(0.02) for s in states]; T = STRtree(gs)
shapes = {}
for i, s in enumerate(states):
    nb = sorted({states[j]['id'] for j in T.query(gs[i]) if j != i and gs[i].intersects(gs[j])})
    shapes[s['id']] = {'r': rings(s['g'], s.get('gs')), 'n': nb}
REG = [{k: v for k, v in s.items() if k not in ('g', 'gs')} for s in states if shapes[s['id']]['r']]
shapes = {k: v for k, v in shapes.items() if v['r']}
# Old region ids (earlier saves) -> the state containing their center.
oldsrc = open(f'{repo}/lib/crisis/regions.js').read()
OLD = json.loads(re.search(r'export const REGIONS = (\[.*?\]);', oldsrc).group(1)) if 'export const REGIONS' in oldsrc else []
SG = [(st['id'], st['g']) for st in states if st['id'] in shapes]; ST = STRtree([g for _, g in SG])
legacy = {}
for o in OLD:
    if o['id'] in shapes: continue
    pt = Point(*o['c']); hit = [SG[i][0] for i in ST.query(pt) if SG[i][1].contains(pt)]
    if not hit:
        j = min(range(len(SG)), key=lambda i: SG[i][1].distance(pt)); hit = [SG[j][0]]
    legacy[o['id']] = hit[:1]
js = ("// HOI4-style states for September 1938 (no borders are drawn between them). Generated from historical-basemaps\n"
      "// world_1938 (Czechoslovakia restored to its pre-Munich frontier, Danzig and East Prussia corrected) and Natural Earth\n"
      "// admin-1 provinces, merged or split to a HOI4-like size. Shapes and neighbors are in public/crisis/regions.json.\n"
      "// `owner` holds the state in September 1938; `area` is the larger historical area (Sudetenland, Bessarabia...).\n"
      f"export const REGIONS = {json.dumps(REG, ensure_ascii=False)};\n"
      "// Region ids from earlier saves, mapped to the states that replaced them.\n"
      f"export const LEGACY_REGIONS = {json.dumps(legacy, ensure_ascii=False)};\n")
json.dump(shapes, open(f'{repo}/public/crisis/regions.json', 'w'), separators=(',', ':'), ensure_ascii=False)
open(f'{repo}/lib/crisis/regions.js', 'w').write(js)
# Country outlines on the map for the changed countries.
def grings(g, tol):
    out = []
    for p in polys(g.simplify(tol, preserve_topology=True)):
        if p.area < 1e-3: continue
        for r in [p.exterior, *p.interiors]:
            cs = [[round(x, 2), round(y, 2)] for x, y in r.coords]
            if len(cs) >= 4: out.append(cs)
    return out
for k in ('Germany', 'Czechoslovakia', 'Poland', 'Hungary', 'Danzig'):
    g = C[k]; c = g.representative_point()
    old_c = GEOJ['geo'].get(k, {}).get('c')
    GEOJ['geo'][k] = {'r': grings(g.intersection(EU), 0.01), 'c': old_c or [round(c.x, 2), round(c.y, 2)]}
    GEOJ['wgeo'][k] = grings(g, 0.05)
json.dump(GEOJ, open(f'{repo}/public/crisis/geo.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print('done', len(REG), 'legacy', len(legacy), file=sys.stderr)
