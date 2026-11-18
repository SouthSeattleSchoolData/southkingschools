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
"""
import json, pathlib, statistics

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

    for r in schools.values():
        r['results'].sort(key=lambda x: (x['year'], x['place'] == 1), reverse=True)
        res = r['results']
        r['titles'] = sum(1 for x in res if x['place'] == 1)
        r['sport_titles'] = sum(1 for x in res if x['place'] == 1 and x['kind'] == 'sport')
        r['runner_up'] = sum(1 for x in res if x['place'] == 2 and x['kind'] == 'sport')

    out = {
        'window': f"{school_year(FIRST_YEAR)} to {school_year(LAST_YEAR)}",
        'updated': '2026-11-18',
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
    for code, r in sorted(schools.items(), key=lambda kv: -kv[1]['titles']):
        print(f"{data[code]['name']:<32} {r.get('cls','-'):>3} titles {r['titles']:>2} (sport {r['sport_titles']:>2}) runner-up {r['runner_up']:>2}  low-income {data[code].get('pct_low_income')}")


if __name__ == '__main__':
    main()
