"""
Adds a district's rows to the checked-in CRDC extracts in tools/raw/, from the raw files the
"Snapshot federal data" GitHub Action saves on the `snapshot` branch.

    git fetch origin snapshot:refs/remotes/origin/snapshot
    mkdir /tmp/snap && git archive origin/snapshot | tar -x -C /tmp/snap
    python3 tools/snapshot/crdc_extract.py /tmp/snap 5308760       # Tahoma's NCES district ID
    node tools/snapshot/build-crdc.mjs

It first checks that the column mapping reproduces every row already in tools/raw/crdc_2023_24.csv
(and the staff/student split file), so the new rows are built the same way as the old ones.
2021-22 rows (keyed by OSPI code) are matched to schools by name using the OSPI enrollment in
the snapshot. Reserve codes: -9 (skipped) counts as 0 for incident counts and blank for staffing
and allegation items; -10/-11 (withheld) count as 0. Arrests and referrals count students
(without disabilities + IDEA + Section 504 only), not incidents.
"""
import csv, sys, json, os
SNAP = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

def load(year, name):
    with open(f'{SNAP}/crdc-{year}/{name}.csv', encoding='latin1') as f:
        return {r['COMBOKEY']: r for r in csv.DictReader(f)}

def n(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v

def raw23():
    files = ['Offenses', 'Harassment or Bullying', 'School Support', 'Restraints and Seclusion', 'Referrals and Arrests', 'Suspensions', 'School Characteristics']
    rows = {}
    for f in files:
        for k, r in load('2023-24', f).items():
            rows.setdefault(k, {}).update(r)
    return rows

COLS = ['nces','firearm_incident','homicide','sexual_assault','robbery','attacks','attacks_with_weapon','threats','threats_with_firearm','firearm_possession','bully_sex','bully_race','bully_disability','bully_orientation','bully_religion','harassment_allegations','teachers_fte','first_year_teachers_fte','second_year_teachers_fte','teachers_absent_fte','counselors_fte','psychologists_fte','social_workers_fte','nurses_fte','security_guard_fte','law_enforcement_fte','physical_restraint','mechanical_restraint','seclusion','arrests','police_referrals','suspension_instances','shootings']

def fmt(v):
    if v is None: return ''
    v = round(v, 2)
    return str(int(v)) if v == int(v) else repr(v).rstrip('0')

def val(r, *cols):
    # Reserve codes (-9 not applicable, -10/-11 withheld) count as zero.
    vals = [n(r.get(c)) for c in cols]
    vals = [v for v in vals if v is not None]
    if not vals: return None
    return sum(max(0, v) for v in vals)

def valb(r, *cols):
    # Staffing and allegation items: blank when the school skipped every part (-9).
    vals = [n(r.get(c)) for c in cols]
    if all(v is None or v < 0 for v in vals): return None
    return sum(max(0, v) for v in vals if v is not None)

def ind(r, c):
    x = r.get(c)
    return 1 if x == 'Yes' else 0 if x in ('No',) else None

def map23(r):
    return {
        'nces': r['COMBOKEY'],
        'firearm_incident': ind(r, 'SCH_FIREARM_IND'),
        'homicide': ind(r, 'SCH_HOMICIDE_IND'),
        'sexual_assault': val(r, 'SCH_OFFENSE_RAPE', 'SCH_OFFENSE_BATT'),
        'robbery': val(r, 'SCH_OFFENSE_ROBWW', 'SCH_OFFENSE_ROBWOW'),
        'attacks': val(r, 'SCH_OFFENSE_ATTWW', 'SCH_OFFENSE_ATTWOW'),
        'attacks_with_weapon': val(r, 'SCH_OFFENSE_ATTWW'),
        'threats': val(r, 'SCH_OFFENSE_THRWW', 'SCH_OFFENSE_THRWOW'),
        'threats_with_firearm': None,
        'firearm_possession': val(r, 'SCH_OFFENSE_POSSWX'),
        'bully_sex': valb(r, 'SCH_HBALLEGATIONS_SEX'), 'bully_race': valb(r, 'SCH_HBALLEGATIONS_RAC'),
        'bully_disability': valb(r, 'SCH_HBALLEGATIONS_DIS'), 'bully_orientation': valb(r, 'SCH_HBALLEGATIONS_ORI'),
        'bully_religion': valb(r, 'SCH_HBALLEGATIONS_REL'),
        'harassment_allegations': valb(r, 'SCH_HBALLEGATIONS_SEX', 'SCH_HBALLEGATIONS_RAC', 'SCH_HBALLEGATIONS_DIS', 'SCH_HBALLEGATIONS_ORI', 'SCH_HBALLEGATIONS_REL'),
        'teachers_fte': valb(r, 'SCH_FTETEACH_TOT'), 'first_year_teachers_fte': valb(r, 'SCH_FTETEACH_FY'),
        'second_year_teachers_fte': valb(r, 'SCH_FTETEACH_SY'), 'teachers_absent_fte': valb(r, 'SCH_FTETEACH_ABSENT'),
        'counselors_fte': valb(r, 'SCH_FTECOUNSELORS'), 'psychologists_fte': valb(r, 'SCH_FTESERVICES_PSY'),
        'social_workers_fte': valb(r, 'SCH_FTESERVICES_SOC'), 'nurses_fte': valb(r, 'SCH_FTESERVICES_NUR'),
        'security_guard_fte': valb(r, 'SCH_FTESECURITY_GUA'), 'law_enforcement_fte': valb(r, 'SCH_FTESECURITY_LEO'),
        'physical_restraint': val(r, 'SCH_RSINSTANCES_PHYS_WODIS', 'SCH_RSINSTANCES_PHYS_IDEA', 'SCH_RSINSTANCES_PHYS_504'),
        'mechanical_restraint': val(r, 'SCH_RSINSTANCES_MECH_WODIS', 'SCH_RSINSTANCES_MECH_IDEA', 'SCH_RSINSTANCES_MECH_504'),
        'seclusion': val(r, 'SCH_RSINSTANCES_SECL_WODIS', 'SCH_RSINSTANCES_SECL_IDEA', 'SCH_RSINSTANCES_SECL_504'),
        # students (boys and girls; the 2023-24 nonbinary counts are withheld), not incidents;
        # without disabilities + IDEA + Section 504 only, as in the 2021-22 figures
        'arrests': val(r, 'TOT_DISCWODIS_ARR_M', 'TOT_DISCWODIS_ARR_F', 'TOT_DISCWDIS_ARR_IDEA_M', 'TOT_DISCWDIS_ARR_IDEA_F', 'SCH_DISCWDIS_ARR_504_M', 'SCH_DISCWDIS_ARR_504_F'),
        'police_referrals': val(r, 'TOT_DISCWODIS_REF_M', 'TOT_DISCWODIS_REF_F', 'TOT_DISCWDIS_REF_IDEA_M', 'TOT_DISCWDIS_REF_IDEA_F', 'SCH_DISCWDIS_REF_504_M', 'SCH_DISCWDIS_REF_504_F'),
        'suspension_instances': None,
        'shootings': val(r, 'SCH_SHOOTING_INS'),
    }

def compare():
    rows = raw23()
    existing = {r['nces']: r for r in csv.DictReader(open(f'{REPO}/tools/raw/crdc_2023_24.csv'))}
    bad = {}
    for k, e in existing.items():
        m = map23(rows[k])
        for c in COLS[1:]:
            a = e[c]; b = fmt(m[c])
            na = n(a) if a != '' else None; nb = n(b) if b != '' else None
            if not ((na is None and nb is None) or (na is not None and nb is not None and abs(na - nb) < 1e-6)):
                bad.setdefault(c, []).append((k, a, b))
    for c, l in bad.items(): print(c, len(l), l[:4])
    print('mismatched columns:', len(bad))

def raw(year, files):
    rows = {}
    for f in files:
        for k, r in load(year, f).items():
            rows.setdefault(k, {}).update(r)
    return rows

def raw21():
    return raw('2021-22', ['Offenses', 'Harassment and Bullying', 'School Support', 'Restraint and Seclusion', 'Referrals and Arrests', 'Suspensions'])

def map21(r):
    m = map23(r)
    for k in ('first_year_teachers_fte', 'second_year_teachers_fte', 'teachers_absent_fte', 'shootings'):
        m[k] = None
    return m

def split23(r):
    return {'nces': r['COMBOKEY'],
            'sexual_assault_by_staff': val(r, 'SCH_OFFENSE_RAPE_BYSTAF', 'SCH_OFFENSE_BATT_BYSTAF'),
            'sexual_assault_by_students': val(r, 'SCH_OFFENSE_RAPE_BYSTUD', 'SCH_OFFENSE_BATT_BYSTUD')}

def same(a, b):
    na = n(a) if a != '' else None; nb = n(b) if b != '' else None
    return (na is None and nb is None) or (na is not None and nb is not None and abs(na - nb) < 1e-6)

def compare_more():
    rows = raw23()
    ex = {r['nces']: r for r in csv.DictReader(open(f'{REPO}/tools/raw/crdc_2023_24_sexual_assault.csv'))}
    bad = [(k, c, e[c], fmt(split23(rows[k])[c])) for k, e in ex.items() for c in ('sexual_assault_by_staff', 'sexual_assault_by_students') if not same(e[c], fmt(split23(rows[k])[c]))]
    print('split mismatches', len(bad), bad[:6])
    data = json.load(open(f'{REPO}/data/schools.json'))
    nces = {s['code']: s.get('nces_id') for s in data['schools']}
    r21 = raw21()
    ex21 = {r['code']: r for r in csv.DictReader(open(f'{REPO}/tools/raw/crdc_2021_22.csv'))}
    bad = {}
    missing = 0
    for code, e in ex21.items():
        k = nces.get(code)
        if k not in r21: missing += 1; continue
        mm = map21(r21[k])
        for c in e:
            if c == 'code': continue
            if not same(e[c], fmt(mm.get(c))): bad.setdefault(c, []).append((code, e[c], fmt(mm.get(c))))
    print('2021-22 rows', len(ex21), 'missing raw', missing)
    for c, l in bad.items(): print(' ', c, len(l), l[:4])


if __name__ == '__main__':
    import os
    SNAP, LEAID = sys.argv[1], sys.argv[2]
    R = os.path.join(REPO, 'tools/raw/')
    compare()
    compare_more()
    r23 = raw23(); r21 = raw21()
    old = [r['nces'] for r in csv.DictReader(open(R + 'crdc_2023_24.csv'))]
    keys = old + sorted(k for k, v in r23.items() if v['LEAID'] == LEAID and k not in old)
    with open(R + 'crdc_2023_24.csv', 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(COLS)
        for k in keys:
            mm = map23(r23[k]); w.writerow([k] + [fmt(mm[c]) for c in COLS[1:]])
    old = [r['nces'] for r in csv.DictReader(open(R + 'crdc_2023_24_sexual_assault.csv'))]
    keys = old + sorted(k for k, v in r23.items() if v['LEAID'] == LEAID and k not in old)
    with open(R + 'crdc_2023_24_sexual_assault.csv', 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['nces', 'sexual_assault_by_staff', 'sexual_assault_by_students'])
        for k in keys:
            sp = split23(r23[k]); w.writerow([k, fmt(sp['sexual_assault_by_staff']), fmt(sp['sexual_assault_by_students'])])
    en = json.load(open(os.path.join(SNAP, 'enrollment_crdc_years.json')))
    norm = lambda s: s.upper().replace(' SCHOOL', '').strip()
    code_by_name = {norm(r['schoolname']): r['schoolcode'] for y in en.values() for r in y}
    lines = open(R + 'crdc_2021_22.csv').read().rstrip('\n').split('\n'); hdr = lines[0].split(',')
    have = {l.split(',')[0] for l in lines[1:]}
    for k, v in sorted(r21.items()):
        code = code_by_name.get(norm(v['SCH_NAME']))
        if v['LEAID'] != LEAID or not code or code in have: continue
        mm = map21(v); lines.append(','.join([code] + [fmt(mm.get(c)) for c in hdr[1:]]))
    open(R + 'crdc_2021_22.csv', 'w').write('\n'.join(lines) + '\n')
    e21 = {r['schoolcode']: r['all_students'] for r in en['2021-22']}; e23 = {r['schoolcode']: r['all_students'] for r in en['2023-24']}
    lines = open(R + 'enrollment_crdc_years.csv').read().rstrip('\n').split('\n'); have = {l.split(',')[0] for l in lines[1:]}
    lines += [f"{c},{e21.get(c, '')},{e23.get(c, '')}" for c in sorted(set(e21) | set(e23)) if c not in have]
    open(R + 'enrollment_crdc_years.csv', 'w').write('\n'.join(lines) + '\n')
    print('Done. Add the new schools to tools/raw/nces_directory.txt (code|nces|0), then run build-crdc.mjs.')
