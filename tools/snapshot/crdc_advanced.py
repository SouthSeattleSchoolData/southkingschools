"""
Writes tools/raw/crdc_2023_24_advanced.csv: AP courses offered, students in at least one AP course,
and students in IB, for every school in tools/raw/crdc_2023_24.csv that has 12th grade.

    git fetch origin snapshot:refs/remotes/origin/snapshot
    mkdir /tmp/snap && git archive origin/snapshot | tar -x -C /tmp/snap
    python3 tools/snapshot/crdc_advanced.py /tmp/snap
    node tools/snapshot/build-crdc.mjs

Source files: crdc-2023-24/Advanced Placement.csv and International Baccalaureate.csv.
-9 (not applicable) on the "offers AP/IB" indicator means the school reported none. The 2023-24
collection has no AP exam results. Students are counted once per program, so a student in both
AP and IB appears in both counts.

hs_enrollment is OSPI 2023-24 grades 9-12 enrollment (q4ba-s3jc), needed only for 6-12 schools
with AP or IB students, so shares use high school students. Other schools use total enrollment.
"""
import csv, os, sys

SNAP = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
HS_ENROLLMENT = {'530034303611': 285, '530039003149': 314, '530039003354': 151}  # Summit Atlas, International, Big Picture


def load(name):
    with open(f'{SNAP}/crdc-2023-24/{name}.csv', encoding='latin1') as f:
        return {r['COMBOKEY']: r for r in csv.DictReader(f)}


def total(r, prefix):
    vals = [float(r.get(f'{prefix}_{g}') or -9) for g in 'MF']
    return int(sum(vals)) if all(v >= 0 for v in vals) else 0


def main():
    ap, ib, chars = load('Advanced Placement'), load('International Baccalaureate'), load('School Characteristics')
    with open(os.path.join(REPO, 'tools/raw/crdc_2023_24.csv')) as f:
        ours = [r['nces'] for r in csv.DictReader(f)]
    rows = []
    for k in ours:
        if chars.get(k, {}).get('SCH_GRADE_G12') != 'Yes':
            continue
        a, b = ap[k], ib[k]
        offers_ap = a['SCH_APENR_IND'] == 'Yes'
        courses = int(a['SCH_APCOURSES']) if offers_ap and a['SCH_APCOURSES'].isdigit() else 0
        rows.append([k, courses, total(a, 'TOT_APENR') if offers_ap else 0,
                     total(b, 'TOT_IBENR') if b['SCH_IBENR_IND'] == 'Yes' else 0, HS_ENROLLMENT.get(k, '')])
    with open(os.path.join(REPO, 'tools/raw/crdc_2023_24_advanced.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['nces', 'ap_courses', 'ap_students', 'ib_students', 'hs_enrollment'])
        w.writerows(rows)
    print(f'{len(rows)} schools with 12th grade')


if __name__ == '__main__':
    main()
