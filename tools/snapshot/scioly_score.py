import yaml, glob, sys, json, re
def score(path):
    d = yaml.safe_load(open(path))
    T = d['Tournament']; ev = [e['name'] for e in d['Events'] if not e.get('trial') and not e.get('trialed')]
    teams = {t['number']: t for t in d['Teams'] if not t.get('exhibition') and not t.get('disqualified')}
    pl = {}
    for p in d['Placings']:
        if p['team'] in teams and p['event'] in ev: pl[(p['team'], p['event'])] = p
    nteams = len(teams)
    tot = {}
    for e in ev:
        ps = [pl.get((t, e), {}) for t in teams]
        npart = sum(1 for p in ps if p.get('participated', True) is not False) if T.get('per-event n') == 'participation' else nteams
        for t in teams:
            p = pl.get((t, e), {})
            if p.get('disqualified'): s = npart + 2
            elif p.get('participated', True) is False: s = npart + 1
            elif 'place' in p: s = p['place']
            else: s = npart + 1
            if p.get('exempt') or p.get('dropped'): s = 0
            tot[t] = tot.get(t, 0) + s
    for pen in d.get('Penalties') or []:
        if pen['team'] in tot: tot[pen['team']] += pen.get('points', 0)
    order = sorted(tot, key=lambda t: tot[t])
    return T, [(i+1, teams[t]['school'], teams[t].get('suffix',''), tot[t], len(order)) for i, t in enumerate(order)]
if __name__ == '__main__':
    T, r = score(sys.argv[1]); print(T['year'], T['division']); [print(x) for x in r[:6]]
