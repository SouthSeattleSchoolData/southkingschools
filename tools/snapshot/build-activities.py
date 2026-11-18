"""Build content/activities.json: sports offered and state results for middle and high schools.

Inputs (all in tools/raw/):
  wiaa_top2_2017_2026.json   WIAA state champion and runner-up rows for our schools,
                             2016-17 through 2025-26 (wiaa.com Tournament History, "By Championship").
  wiaa_directory.json        Classification, league, mascot and WIAA-registered sports per school
                             (wiaa.finalforms.com/state_schools).
  scioly_wa_states_2016_2026.json  Washington Science Olympiad state results for teams from our cities,
                             scored from Duosmium data with tools/snapshot/scioly_score.py.
Knowledge Bowl champions and the 2026 chess results are entered below by hand with their sources.

Run: python3 tools/snapshot/build-activities.py
  clubs_part1.py, clubs_part2.py  Club lists copied from each high school's website (school year, URL, names).
"""
import json, pathlib, re, statistics, importlib.util

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / 'tools' / 'raw'
FIRST_YEAR, LAST_YEAR = 2017, 2026  # school years ending in these years: 2016-17 .. 2025-26

WIAA_NAMES = {
    'Bellevue': '2701', 'Sammamish': '3282', 'Newport': '3486', 'Newport (Bellevue)': '3486', 'Interlake': '3588',
    'Issaquah': '3385', 'Liberty (Issaquah)': '3962', 'Skyline': '4495',
    'Kent-Meridian': '2797', 'Kentridge': '3640', 'Kentwood': '4128', 'Kentlake': '4492',
    'Renton': '2475', 'Hazen': '3630', 'Lindbergh': '3741',
    'Franklin': '2182', 'West Seattle': '2234', 'Cleveland': '2392', 'Chief Sealth': '3096', 'Rainier Beach': '3327',
    'Tahoma': '2849', 'Summit Atlas': '5469',
}
SCIOLY_NAMES = {
    'Interlake High School': '3588', 'Skyline High School': '4495', 'Liberty Senior High School': '3962',
    'Odle Middle School': '3631', 'Chinook Middle School': '3338', 'Beaver Lake Middle School': '4460',
    'Pine Lake Middle School': '3879',
}
# Washington State Knowledge Bowl champions (Wikipedia list of state champions; no runner-ups published).
KNOWLEDGE_BOWL = [(2018, '3A', '3588'), (2024, '3A', '3630'), (2026, '4A', '3630')]
# 60th Washington State High School Chess Team Championships, Feb 27-28, 2026 (KPQ / WSHSCA).
CHESS_2026 = [('4A', 1, '4495'), ('4A', 2, '3486'), ('3A', 2, '3588'), ('2A', 3, '2392')]

SPORT_LABEL = {
    'XC': 'cross country', 'Swim': 'swimming and diving', 'Track': 'track and field',
    'Swimming & Diving': 'swimming and diving', 'Track & Field': 'track and field', 'Cross Country': 'cross country',
    'Softball (Fastpitch)': 'fastpitch softball',
}


def event_label(raw):
    """'Basketball - Boys' -> 'Boys basketball'; 'Football' stays 'Football'."""
    if ' - ' in raw:
        sport, who = raw.split(' - ')
        return f"{who} {SPORT_LABEL.get(sport, sport.lower())}"
    return SPORT_LABEL.get(raw, raw).capitalize() if raw != 'Football' else 'Football'


def sport_label(raw):
    who, _, sport = raw.partition(' ')
    return who, SPORT_LABEL.get(sport, sport.lower())


# Club categories, checked in this order; the first match wins.
CLUB_CATEGORIES = [
    ('stem', 'STEM', r"robot|\bbots?\b|cod(e|ing|es)\b|program|\bmath|calcul|scien|engineer|physic|chem|\bbio|\bai\b|artificial|\bdata\b|cyber|rocket|aero|aviation|astronom|tech|computer|stem\b|\btsa\b|olympiad|research|neuro|geolog|entomolog|ocean|cisco|game dev|game design|cubing|lego|zoology|forensic|ignite worldwide|\bhex\b|gear garden"),
    ('careers', 'Business and careers', r"deca|fbla|fccla|hosa|\bffa\b|skills ?usa|business|financ|invest|stock|econom|entrepreneur|real estate|career|medic|nursing|health|sports? med|educators|teaching|cadet|military|njrotc|welding|\bauto|metal|wood ?shop|architect|preschool|horticulture|running start|founders|success center|college prep|academic support|ap help"),
    ('academic', 'Debate, civics and academics', r"socialism|palestine|archaeolog|debate|mock trial|model u|united nations|speech|legislation|\blaw\b|citizenship|gavel|policy|quiz|knowledge bowl|history|geography|philosoph|psycholog|problem solving|honor"),
    ('arts', 'Arts, music and writing', r"\bart\b|\barts\b|music|band|choir|orchestra|drama|theat|thespian|players|film|photo|pics|dance|k[- ]?pop|video|mix it up|eclipse|guitar|jazz|percussion|drum|majorette|color guard|writ|literar|poetry|journal|newspaper|yearbook|magazine|\bzine|animation|toons|graphic|fashion|sewing|craft|crochet|yarn|fiber|origami|clay|mariachi|choreograph|chamber|tri-m|harmony|tones|press|inquirer|chronicles|media|book|literature|\bread|soundboard|karaoke|voice acting|glamor|vogue|fitted|nail|collage|hip hop|candid|vantage|artisan"),
    ('culture', 'Culture and identity', r"student union|student association|\bbsu\b|\bmsa\b|\bosu\b|aapi|asian|black|latin|hispan|filipin|chinese|japan|korean|vietnam|indian|south asian|sasa|muslim|jewish|christian|bible|jesus|fellowship|sikh|panjabi|habesha|habasha|african|pacific|polynesian|pasefika|native|indigenous|slavic|european|german|french|spanish|culture|cultural|multicultural|multiracial|immigrant|heritage|\bgsa\b|glow|pride|lgbt|prism|gender|sexuality|qsa|feminis|women|girl|\bcham\b|alma|kapamilya|melanin|bollywood|brazil|club america|asl\b|sign language|marsha|youth alive|made for more|queenmakers|unidos|latino heat|kapa|disability|diversity|undivided|victory|actualizer"),
    ('service', 'Service and leadership', r"key club|interact|red cross|unicef|unesco|\bnhs\b|\basb\b|class council|council|link crew|crew|leader|volunteer|servic|kindness|make a wish|birthday dreams|best buddies|athletes for kids|cancer|salvation|smile|days for girls|community|outreach|advocacy|advocates|green|\beco|earth|environment|sierra|envirothon|garden|animal|pawsitive|sources of strength|mental|nami|active minds|well|beautification|closet|feed|sunshine|spread the love|precious gifts|letters for rose|care craft|patriots for people|bright hearts|one love|dogs for|gifts|influence the choice|graduation|better me|revive|vine project|knights who care|heart|kids|unified|builder|literacy|sexual violence"),
]
CLUB_RX = [(k, label, re.compile(rx, re.I)) for k, label, rx in CLUB_CATEGORIES]


# Names the keyword rules would put in the wrong group.
CLUB_OVERRIDES = {'chinese chess club': 'hobby', 'girls frisbee': 'hobby', 'girls hiking club': 'hobby', 'girls in sports': 'hobby', 'days for girls': 'service', 'environmental feminist club': 'service', 'mental health awareness club': 'service', 'student advocates for mental health & addiction': 'service', 'mental health club': 'service', 'byte club': 'stem', 'criminal justice club': 'careers', 'digital recording club': 'arts', 'pro justice union (pju)': 'academic', 'mesa builders': 'stem', 'international buddy': 'service', 'mun': 'academic', 'roots and shoots': 'service', 'seattle humane support club': 'service'}


def club_category(name):
    if name.lower() in CLUB_OVERRIDES:
        return CLUB_OVERRIDES[name.lower()]
    for k, _, rx in CLUB_RX:
        if rx.search(name):
            return k
    return 'hobby'


def load_clubs():
    out = {}
    for part in ('clubs_part1.py', 'clubs_part2.py'):
        spec = importlib.util.spec_from_file_location(part[:-3], RAW / part)
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        out.update(mod.CLUBS)
    return out


def school_year(y):
    return f"{y - 1}-{str(y)[2:]}"


def main():
    schools = {}

    def rec(code):
        return schools.setdefault(code, {'results': []})

    for code, (cls, league, mascot, sports) in json.loads((RAW / 'wiaa_directory.json').read_text()).items():
        r = rec(code)
        r.update(cls=cls, league=league, mascot=mascot)
        groups = {}
        for s in sports.split(';'):
            who, name = sport_label(s)
            groups.setdefault(who, []).append(name)
        r['sports'] = {k: sorted(set(v)) for k, v in groups.items()}

    for y, sport, cls, place, name in json.loads((RAW / 'wiaa_top2_2017_2026.json').read_text()):
        if not FIRST_YEAR <= y <= LAST_YEAR:
            continue
        code = WIAA_NAMES[name]
        rec(code)['results'].append({'year': school_year(y), 'kind': 'sport', 'event': event_label(sport), 'cls': cls, 'place': place})

    best = {}
    for y, div, rank, n, school, suffix, city in json.loads((RAW / 'scioly_wa_states_2016_2026.json').read_text()):
        code = SCIOLY_NAMES.get(school)
        if not code or not FIRST_YEAR <= y <= LAST_YEAR:
            continue
        key = (code, y)
        if key not in best or rank < best[key][0]:
            best[key] = (rank, n)
    for (code, y), (rank, n) in best.items():
        rec(code)['results'].append({'year': school_year(y), 'kind': 'academic', 'event': 'Science Olympiad state tournament', 'place': rank, 'of': n})

    for y, cls, code in KNOWLEDGE_BOWL:
        rec(code)['results'].append({'year': school_year(y), 'kind': 'academic', 'event': 'Knowledge Bowl', 'cls': cls, 'place': 1})
    for cls, place, code in CHESS_2026:
        rec(code)['results'].append({'year': school_year(2026), 'kind': 'academic', 'event': 'Chess team championship', 'cls': cls, 'place': place})

    for code, (year, url, names) in load_clubs().items():
        seen, items = set(), []
        for n in names.split('|'):
            n = n.strip()
            if n and n.lower() not in seen:
                seen.add(n.lower()); items.append({'n': n, 'c': club_category(n)})
        rec(code)['clubs'] = {'year': year, 'url': url, 'list': sorted(items, key=lambda x: x['n'].lower())}

    for r in schools.values():
        r['results'].sort(key=lambda x: (x['year'], x['place'] == 1), reverse=True)
        res = r['results']
        r['titles'] = sum(1 for x in res if x['place'] == 1)
        r['sport_titles'] = sum(1 for x in res if x['place'] == 1 and x['kind'] == 'sport')
        r['runner_up'] = sum(1 for x in res if x['place'] == 2 and x['kind'] == 'sport')

    out = {
        'window': f"{school_year(FIRST_YEAR)} to {school_year(LAST_YEAR)}",
        'updated': '2026-11-18',
        'club_categories': [{'key': k, 'label': label} for k, label, _ in CLUB_CATEGORIES] + [{'key': 'hobby', 'label': 'Games, hobbies and sport clubs'}],
        'club_list_missing': {'4495': 'Skyline posts its club list only on a student ASB site', '2797': 'Kent-Meridian has no club page on its website', '2475': "Renton High's website could not be read automatically", '5469': 'Summit Atlas does not post a club list on its website'},
        'sources': [
            {'name': 'WIAA Tournament History (state champions and runners-up)', 'url': 'https://www.wiaa.com/history/'},
            {'name': 'WIAA school directory (classification, league and sports)', 'url': 'https://wiaa.finalforms.com/state_schools'},
            {'name': 'Washington Science Olympiad state results (Duosmium)', 'url': 'https://www.duosmium.org/results/'},
            {'name': 'Washington State Knowledge Bowl champions', 'url': 'https://en.wikipedia.org/wiki/Washington_State_Knowledge_Bowl_Tournament'},
            {'name': '2026 state high school chess team championships (KPQ)', 'url': 'https://kpq.com/washington-high-school-chess/'},
        ],
        'schools': dict(sorted(schools.items())),
    }
    (ROOT / 'content' / 'activities.json').write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')

    data = {s['code']: s for s in json.loads((ROOT / 'data' / 'schools.json').read_text())['schools']}
    from collections import Counter
    for code, r in schools.items():
        if 'clubs' in r:
            c = Counter(x['c'] for x in r['clubs']['list'])
            print(f"{data[code]['name']:<30} clubs {len(r['clubs']['list']):>3}  " + ' '.join(f"{k}:{v}" for k, v in sorted(c.items())))
    for code, r in sorted(schools.items(), key=lambda kv: -kv[1]['titles']):
        print(f"{data[code]['name']:<32} {r.get('cls','-'):>3} titles {r['titles']:>2} (sport {r['sport_titles']:>2}) runner-up {r['runner_up']:>2}  low-income {data[code].get('pct_low_income')}")


if __name__ == '__main__':
    main()
