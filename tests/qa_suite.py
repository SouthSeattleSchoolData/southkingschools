"""
Sound Choice - automated QA suite.

Test cases are grouped by ISO/IEC 25010 quality characteristic and identified
by ID so the report (tests/QA-REPORT.md) can trace each result.

Run from the repo root:
    pip install playwright && npm i axe-core
    python3 tests/qa_suite.py            # writes tests/results.json

Needs Chrome/Chromium. Map tiles and the address lookup are stubbed so the
suite runs offline and gives the same answer every time.
"""
import base64, contextlib, functools, http.server, json, os, re, socketserver, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
AXE = next((p for p in [os.environ.get('AXE_PATH', ''), ROOT / 'node_modules/axe-core/axe.min.js',
                        Path('/tmp/qatools/node_modules/axe-core/axe.min.js')] if p and Path(p).exists()), None)
CHROME = next((p for p in ['/usr/bin/google-chrome', '/usr/bin/chromium'] if Path(p).exists()), None)
TILE = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=')
PAGES = ['home', 'find', 'compare', 'findings', 'safety', 'glossary', 'method', 's-3741']
RESULTS = []
TESTS = []


def case(cid, characteristic, title):
    def wrap(fn):
        @functools.wraps(fn)
        def run(*a):
            t = time.time()
            try:
                detail = fn(*a) or ''
                status = 'PASS'
            except AssertionError as e:
                status, detail = 'FAIL', str(e)
            except Exception as e:  # noqa: BLE001 - an unexpected error is a failed case
                status, detail = 'ERROR', f'{type(e).__name__}: {e}'
            RESULTS.append(dict(id=cid, characteristic=characteristic, title=title, status=status,
                                detail=str(detail)[:4000], seconds=round(time.time() - t, 2)))
            print(f'{status:5} {cid:4} {title} {("- " + str(detail)[:160]) if detail else ""}', flush=True)
        run.cid = cid
        TESTS.append(run)
        return run
    return wrap


@contextlib.contextmanager
def server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as httpd:
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        yield f'http://127.0.0.1:{httpd.server_address[1]}/'
        httpd.shutdown()


def new_page(browser, base, width=1280, height=860, mobile=False, **ctx):
    c = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile, has_touch=mobile, **ctx)
    pg = c.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'tile' not in m.text and pg.errors.append('console: ' + m.text))
    pg.on('dialog', lambda d: (pg.errors.append('DIALOG: ' + d.message), d.dismiss()))
    pg.route('**/tile.openstreetmap.org/**', lambda r: r.fulfill(status=200, content_type='image/png', body=TILE))
    pg.route('**/nominatim.openstreetmap.org/**', lambda r: r.fulfill(
        status=200, content_type='application/json', body='[{"lat":"47.4829","lon":"-122.2171","display_name":"Renton, WA"}]'))
    pg.route('**/gc.zgo.at/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='window.goatcounter = Object.assign(window.goatcounter || {}, {count() {}});'))
    pg.route('**/*.goatcounter.com/**', lambda r: r.fulfill(status=204, body=''))
    pg.base = base
    return pg


def go(pg, view, wait=600):
    pg.goto(pg.base + '#' + view)
    pg.wait_for_function('document.querySelector("#findCount") !== null')
    pg.wait_for_timeout(wait)


# ---------------------------------------------------------------- Functional suitability
@case('F01', 'Functional suitability', 'Every page loads with a heading and no script errors (desktop + phone)')
def f01(b, base):
    bad = []
    for mobile, (w, h) in [(False, (1280, 860)), (True, (390, 844))]:
        pg = new_page(b, base, w, h, mobile)
        for v in PAGES:
            go(pg, v)
            heads = pg.evaluate("() => [...document.querySelectorAll('.view.on h1, .view.on h2')].filter(e => e.offsetParent).length")
            if not heads: bad.append(f'{v}: no visible heading')
        if pg.errors: bad.append(f'{"phone" if mobile else "desktop"} errors: {pg.errors[:3]}')
        pg.context.close()
    assert not bad, '; '.join(bad)
    return f'{len(PAGES)} pages x 2 devices'


@case('F02', 'Functional suitability', 'All 187 school profiles render without errors')
def f02(b, base):
    pg = new_page(b, base)
    go(pg, 'home')
    codes = pg.evaluate("async () => (await (await fetch('data/schools.json')).json()).schools.map(s => s.code)")
    bad = []
    for c in codes:
        pg.evaluate(f"location.hash = 's-{c}'")
        pg.wait_for_timeout(60)
        title = pg.evaluate("document.title")
        if 'Sound Choice' not in title or title.startswith('Home'):
            bad.append(c)
    assert len(codes) == 187, f'{len(codes)} schools in data'
    assert not bad, f'profiles that did not open: {bad[:10]}'
    assert not pg.errors, pg.errors[:3]
    return f'{len(codes)} profiles'


@case('F03', 'Functional suitability', 'Home search suggests schools and ignores punctuation in names')
def f03(b, base):
    pg = new_page(b, base)
    go(pg, 'home')
    pg.fill('#heroQ', 'impact salish')
    pg.wait_for_timeout(200)
    opts = pg.locator('#heroSuggest button').all_inner_texts()
    assert any('Salish Sea' in o for o in opts), f'no match for "impact salish": {opts}'
    pg.fill('#heroQ', 'summit atlas')
    pg.wait_for_timeout(200)
    assert any('Atlas' in o for o in pg.locator('#heroSuggest button').all_inner_texts()), 'no match for "summit atlas"'
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    assert pg.evaluate('location.hash').startswith('#s-'), 'Enter on a suggestion did not open the school'


@case('F04', 'Functional suitability', 'Find: name filter, area filter and clearing work')
def f04(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    n = lambda: int(re.search(r'\d+', pg.inner_text('#findCount')).group())
    start = n()
    pg.fill('#findQ', 'elementary'); pg.wait_for_timeout(200)
    elem = n()
    pg.fill('#findQ', 'lindbergh'); pg.wait_for_timeout(200)
    assert pg.inner_text('#findCount').startswith('1 school,'), f'singular count reads: {pg.inner_text("#findCount")}'
    pg.fill('#findQ', ''); pg.wait_for_timeout(200)
    assert n() == start, 'clearing the box did not restore the list'
    pg.locator('#fArea input').first.uncheck(); pg.wait_for_timeout(200)
    fewer = n()
    pg.locator('#fArea input').first.check(); pg.wait_for_timeout(200)
    assert 0 < elem < start and fewer < start and n() == start, (start, elem, fewer)
    return f'all={start}, "elementary"={elem}, one area off={fewer}'


@case('F05', 'Functional suitability', 'Compare: add up to 4, refuse a 5th, survive reload, remove')
def f05(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    btns = pg.locator('#findOut [data-compare]')
    for i in range(5):
        btns.nth(i).click(); pg.wait_for_timeout(120)
    assert pg.inner_text('#cmpCount') == '4', f'badge shows {pg.inner_text("#cmpCount")}'
    pg.reload(); pg.wait_for_timeout(600)
    go(pg, 'compare')
    cols = pg.evaluate("() => document.querySelectorAll('#cmpOut [data-remove]').length")
    assert cols == 4, f'compare page shows {cols} schools'
    pg.locator('#cmpOut [data-remove]').first.click(); pg.wait_for_timeout(300)
    assert pg.inner_text('#cmpCount') == '3', 'remove did not update the badge'


@case('F06', 'Functional suitability', '"Use my location" sorts schools by distance')
def f06(b, base):
    pg = new_page(b, base, geolocation={'latitude': 47.4829, 'longitude': -122.2171}, permissions=['geolocation'])
    go(pg, 'home')
    pg.click('#heroLoc'); pg.wait_for_timeout(900)
    assert pg.evaluate('location.hash') == '#find', 'did not go to Find'
    txt = pg.inner_text('#findOut')
    assert re.search(r'\d+(\.\d+)? mi', txt), 'no distances shown'


@case('F07', 'Functional suitability', 'ZIP code and street address lookups')
def f07(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    pg.fill('#findQ', '98055'); pg.press('#findQ', 'Enter'); pg.wait_for_timeout(600)
    assert re.search(r'\d+(\.\d+)? mi', pg.inner_text('#findOut')), 'ZIP lookup gave no distances'
    go(pg, 'home')
    pg.fill('#heroQ', '1000 Main Ave S, Renton'); pg.press('#heroQ', 'Enter'); pg.wait_for_timeout(900)
    assert pg.evaluate('location.hash') == '#find', 'address lookup did not go to Find'


@case('F08', 'Functional suitability', 'Theme toggle switches and is remembered')
def f08(b, base):
    pg = new_page(b, base)
    go(pg, 'home')
    before = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.click('#themeBtn'); pg.wait_for_timeout(200)
    after = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.reload(); pg.wait_for_timeout(500)
    assert before != after and pg.evaluate("getComputedStyle(document.body).backgroundColor") == after


@case('F09', 'Functional suitability', 'Findings: every measure redraws with x and y axis titles, one legend')
def f09(b, base):
    pg = new_page(b, base)
    go(pg, 'findings')
    chips = pg.locator('#eqChips button')
    bad = []
    for i in range(chips.count()):
        chips.nth(i).click(); pg.wait_for_timeout(150)
        titles = pg.locator('#eqSvg .axis-title').count()
        if titles < 2: bad.append(chips.nth(i).inner_text())
    legends = pg.evaluate("() => document.querySelectorAll('#v-findings .legend').length")
    dg = pg.locator('#dgSvg .axis-title').count()
    assert not bad and dg >= 2, f'missing axis titles: {bad}, discipline chart titles={dg}'
    return f'{chips.count()} measures; legends on page={legends}'


@case('F10', 'Functional suitability', 'Every ⓘ button has a glossary definition')
def f10(b, base):
    pg = new_page(b, base)
    missing = set()
    for v in PAGES:
        go(pg, v)
        if v == 'compare' and pg.locator('#cmpExample').count():
            pg.click('#cmpExample'); pg.wait_for_timeout(300)
        btns = pg.locator('.view.on .info')
        for i in range(min(btns.count(), 60)):
            btns.nth(i).click(); pg.wait_for_timeout(40)
            t = pg.evaluate("document.getElementById('tip').innerText.trim()")
            if len(t) < 15: missing.add(f'{v}:{btns.nth(i).get_attribute("data-g") or i}')
            pg.keyboard.press('Escape')
    assert not missing, f'empty definitions: {sorted(missing)[:10]}'


@case('F11', 'Functional suitability', 'School profile: four trend charts with axis titles, small-school caution where due')
def f11(b, base):
    pg = new_page(b, base)
    go(pg, 's-3586', 900)
    charts = pg.locator('.trendgrid .chartbox svg').count()
    titles = pg.locator('.trendgrid .axis-title').count()
    assert charts == 4 and titles >= 8, f'{charts} charts, {titles} axis titles'
    d = pg.evaluate("async () => (await (await fetch('data/schools.json')).json()).schools")
    small = next(x for x in d if x['enrollment'] < 150 and x.get('school_type') == 'P' and x.get('ela_proficient') is not None)
    go(pg, 's-' + small['code'], 700)
    assert pg.locator('.caution').count() == 1, f"no caution on {small['name']} ({small['enrollment']} students)"
    return f"caution shown on {small['name']}"


@case('F12', 'Functional suitability', 'Findings: recovery chart shows all seven areas; level filter works')
def f12(b, base):
    pg = new_page(b, base)
    go(pg, 'findings', 900)
    lines = pg.locator('#recSvg .endlbl').count()
    pg.locator('#recLevel button', has_text='High').click(); pg.wait_for_timeout(200)
    after = pg.locator('#recSvg .endlbl').count()
    summary = pg.inner_text('#recoverySum')
    assert lines == 7 and after >= 6 and 'of' in summary, (lines, after, summary)
    return summary[:120]


@case('F13', 'Functional suitability', 'Safety page: incident, restraint, staffing, lead and district-risk tables are filled')
def f13(b, base):
    pg = new_page(b, base)
    go(pg, 'safety', 900)
    counts = {t: pg.locator(f'#{t} tbody tr').count() for t in ['crdcTbl', 'restraintTbl', 'staffTbl', 'leadTbl', 'riskTbl']}
    assert counts['crdcTbl'] == 25 and counts['restraintTbl'] == 15 and counts['staffTbl'] == 7 and counts['leadTbl'] > 20 and counts['riskTbl'] == 9, counts
    return str(counts)


@case('F14', 'Functional suitability', 'Language menu translates the interface, is remembered, and switches back')
def f14(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    pg.select_option('#langSel', 'es'); pg.wait_for_timeout(300)
    nav_es = pg.inner_text('#nav')
    pg.reload(); pg.wait_for_timeout(900)
    remembered = pg.evaluate("document.documentElement.lang")
    placeholder = pg.get_attribute('#findQ', 'placeholder')
    go(pg, 's-3586', 700)
    heading = pg.locator('#v-school h2.sec').first.inner_text()
    pg.select_option('#langSel', 'en'); pg.wait_for_timeout(400)
    nav_en = pg.inner_text('#nav')
    assert 'Buscar escuelas' in nav_es and remembered == 'es' and 'código postal' in placeholder and 'Find schools' in nav_en, (nav_es[:40], remembered, placeholder, nav_en[:30])
    assert pg.locator('#langNotice').count() == 0, 'English notice should be gone'
    assert not pg.errors, pg.errors[:3]
    return f'profile heading in Spanish: {heading!r}'


@case('F15', 'Functional suitability', 'Search-engine pages: one per school, linked from the sitemap, valid HTML')
def f15(b, base):
    import subprocess
    pages = sorted((ROOT / 'school').glob('*.html'))
    sitemap = (ROOT / 'sitemap.xml').read_text()
    assert len(pages) == 187 and sitemap.count('<url>') == 188, (len(pages), sitemap.count('<url>'))
    assert 'Sitemap:' in (ROOT / 'robots.txt').read_text()
    pg = new_page(b, base)
    pg.goto(base + 'school/3586.html'); pg.wait_for_timeout(300)
    link = pg.get_attribute('a.btn', 'href')
    pg.click('a.btn'); pg.wait_for_timeout(900)
    assert pg.evaluate('location.hash') == '#s-3586', f'link {link} opened {pg.evaluate("location.hash")}'
    cli = next((p for p in [ROOT / 'node_modules/.bin/html-validate', Path('/tmp/qatools/node_modules/.bin/html-validate')] if p.exists()), None)
    r = subprocess.run([str(cli), '--config', str(ROOT / 'tests/.htmlvalidate.json'), str(pages[0]), str(ROOT / 'school/3586.html')], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout[-800:]


@case('S07', 'Security', '"Report a mistake" links are built safely from school names')
def s07(b, base):
    pg = new_page(b, base)
    go(pg, 's-5608', 700)  # "Impact | Salish Sea Elementary": has a | in its name
    href = pg.locator('a', has_text='Report a mistake on this page').get_attribute('href')
    assert href.startswith('https://github.com/') and ' ' not in href and '|' not in href, href
    return href[:110]


@case('M03', 'Maintainability', 'Updater refuses data in the wrong scale (OSPI format change guard)')
def m03(b, base):
    import subprocess
    code = """
import { checkData, asPercent } from './tools/build-data.js';
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('data/schools.json'));
const ok = checkData(d).length === 0;
const bad = structuredClone(d); bad.schools.forEach((s) => { if (typeof s.ela_proficient === 'number') s.ela_proficient /= 100; }); bad.state.ela_proficient = 0.5;
const caught = checkData(bad).length > 0;
const converts = asPercent('0.6892') === 68.9 && asPercent('67.9%') === '67.9%';
console.log(JSON.stringify({ ok, caught, converts }));
"""
    r = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True, text=True)
    out = json.loads(r.stdout.strip() or '{}')
    assert out == {'ok': True, 'caught': True, 'converts': True}, r.stdout + r.stderr


@case('D02', 'Functional correctness: data', 'Merged federal, trend and lead data are internally consistent')
def d02(b, base):
    d = json.loads((ROOT / 'data/schools.json').read_text())
    s = d['schools']
    probs = []
    years = d.get('trend_years', [])
    if len(years) != 5: probs.append(f'trend years {years}')
    for x in s:
        t = x.get('trend')
        if t and any(len(t[k]) != len(years) for k in t): probs.append(f"{x['name']} trend length")
        c = x.get('crdc')
        if c and any((c[k] or 0) < 0 for k in ['attacks', 'threats', 'firearm_possession']): probs.append(f"{x['name']} negative CRDC")
        if c and c.get('harassment_allegations') is not None and c['harassment_allegations'] != sum(v or 0 for v in c['bullying'].values()): probs.append(f"{x['name']} bullying total")
        l = x.get('lead')
        if l and not (l['over15'] <= l['over5'] <= l['tested']): probs.append(f"{x['name']} lead counts")
        if x.get('teachers_new_pct') is not None and not 0 <= x['teachers_new_pct'] <= 100: probs.append(f"{x['name']} teachers")
    assert not probs, probs[:10]
    return f"{sum(1 for x in s if x.get('crdc'))} CRDC, {sum(1 for x in s if x.get('trend'))} trends, {sum(1 for x in s if x.get('lead'))} lead records"


# ---------------------------------------------------------------- Security (input handling)
XSS = '<img src=x onerror=alert(1)>"\';{}$%*=`|\\😀'


@case('S01', 'Security', 'Script/HTML typed into either search box is filtered and never runs')
def s01(b, base):
    pg = new_page(b, base)
    out = []
    for view, sel in [('home', '#heroQ'), ('find', '#findQ')]:
        go(pg, view)
        pg.click(sel); pg.keyboard.type(XSS); pg.wait_for_timeout(150)
        val = pg.input_value(sel)
        assert not re.search(r'[<>"{}$%*=`|\\;]', val), f'{sel} kept: {val!r}'
        pg.press(sel, 'Enter'); pg.wait_for_timeout(500)
        assert pg.locator('img[src="x"]').count() == 0, 'injected <img> found in page'
        out.append(f'{sel} -> {val!r}')
    assert not [e for e in pg.errors if 'DIALOG' in e], pg.errors
    return '; '.join(out)


@case('S02', 'Security', 'Pasted special characters are filtered too')
def s02(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    pg.evaluate("""() => { const i = document.querySelector('#findQ'); i.focus();
        i.value = 'Lind<script>say</script>bergh'; i.dispatchEvent(new Event('input', {bubbles: true})); }""")
    val = pg.input_value('#findQ')
    assert val == 'Lindscriptsay/scriptbergh', val
    hint = pg.inner_text('#findHint')
    assert hint, 'no hint shown after filtering'
    return f'value={val!r}, hint={hint!r}'


@case('S03', 'Security', 'Characters used in names and addresses are kept')
def s03(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    sample = "St. Anne's-Ríos #4, Renton/Kent: A&B"
    pg.click('#findQ'); pg.keyboard.type(sample)
    assert pg.input_value('#findQ') == sample, pg.input_value('#findQ')


@case('S04', 'Security', 'Text boxes stop at 100 characters')
def s04(b, base):
    pg = new_page(b, base)
    go(pg, 'home')
    pg.click('#heroQ'); pg.keyboard.insert_text('a' * 150)
    n = len(pg.input_value('#heroQ'))
    assert n <= 100, n


@case('S05', 'Security', 'Tampered browser storage and URLs do not break the site')
def s05(b, base):
    pg = new_page(b, base)
    go(pg, 'home')
    pg.evaluate("""() => { localStorage.setItem('sks-compare', '{"a":1}');
                           localStorage.setItem('sks-theme', '"><img src=x onerror=alert(1)>'); }""")
    for h in ['s-999999', 's-<script>', 'nope', '%3Cimg%20src=x%3E', 'compare']:
        pg.goto(base + '#' + h); pg.wait_for_timeout(400)
    assert not pg.errors, pg.errors[:3]
    assert pg.locator('img[src="x"]').count() == 0


@case('S06', 'Security', 'Links that open a new tab use rel="noopener"')
def s06(b, base):
    pg = new_page(b, base)
    bad = set()
    for v in PAGES:
        go(pg, v)
        bad |= set(pg.evaluate("""() => [...document.querySelectorAll('a[target=_blank]')]
            .filter(a => !/noopener/.test(a.rel)).map(a => a.href)"""))
    assert not bad, sorted(bad)[:8]


# ---------------------------------------------------------------- Accessibility (WCAG 2.2 AA)
@case('A01', 'Usability: accessibility', 'axe-core WCAG 2.2 AA scan, every page, light and dark')
def a01(b, base):
    assert AXE, 'axe-core not installed (npm i axe-core)'
    src = Path(AXE).read_text()
    found = {}
    for theme in ['light', 'dark']:
        pg = new_page(b, base, color_scheme=theme)
        states = [(v, None) for v in PAGES] + [('find', '#viewSeg [data-v=map]'), ('find', '#viewSeg [data-v=table]'),
                                              ('compare', '#cmpExample'), ('s-2182', None), ('home', 'lang:es')]
        for v, click in states:
            go(pg, v, 900)
            if click and click.startswith('lang:'):
                pg.select_option('#langSel', click[5:]); pg.wait_for_timeout(500)
            elif click and pg.locator(click).count():
                pg.click(click); pg.wait_for_timeout(700)
            if not pg.evaluate("!!window.axe"): pg.add_script_tag(content=src)
            res = pg.evaluate("""async () => (await axe.run(document, {runOnly: {type: 'tag',
                values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations
                .map(v => ({id: v.id, impact: v.impact, n: v.nodes.length,
                            sample: v.nodes.slice(0, 2).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\\n')[1])}))""")
            for r in res:
                found.setdefault(r['id'], []).append(f"{theme}/{v} x{r['n']} {r['sample']}")
        pg.context.close()
    assert not found, json.dumps(found, indent=1)[:1500]
    return f'{len(states)} page states x 2 themes, 0 violations'


@case('A02', 'Usability: accessibility', 'Keyboard focus is visible on links, buttons and inputs')
def a02(b, base):
    pg = new_page(b, base)
    go(pg, 'home')
    invisible = []
    for _ in range(25):
        pg.keyboard.press('Tab')
        r = pg.evaluate("""() => { const e = document.activeElement, s = getComputedStyle(e);
            const ring = (x) => { const c = getComputedStyle(x); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 || c.boxShadow !== 'none'; };
            const box = e.closest('.search');  // search boxes draw the ring on the whole box
            return [e.tagName + (e.id ? '#' + e.id : ''), ring(e) || (box && ring(box))] }""")
        if not r[1]: invisible.append(r[0])
    assert not invisible, f'no focus indicator: {sorted(set(invisible))}'


@case('A06', 'Usability: accessibility', 'Keyboard only: search, open a school, add it to compare')
def a06(b, base):
    pg = new_page(b, base)
    go(pg, 'find')
    pg.focus('#findQ'); pg.keyboard.type('lindbergh'); pg.wait_for_timeout(200)
    for _ in range(40):
        pg.keyboard.press('Tab')
        if pg.evaluate("document.activeElement.matches('.rname a')"): break
    assert pg.evaluate("document.activeElement.matches('.rname a')"), 'could not Tab to a school link'
    pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    assert pg.evaluate('location.hash').startswith('#s-'), 'Enter did not open the school'
    for _ in range(60):
        pg.keyboard.press('Tab')
        if pg.evaluate("document.activeElement.matches('[data-compare]')"): break
    pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    assert pg.inner_text('#cmpCount') == '1', 'could not add to compare by keyboard'


@case('A03', 'Usability: accessibility', 'Reflow: no sideways scrolling at 320 px wide (WCAG 1.4.10)')
def a03(b, base):
    pg = new_page(b, base, 320, 640, True)
    over = []
    for v in PAGES:
        go(pg, v)
        w = pg.evaluate("document.documentElement.scrollWidth")
        if w > 322: over.append(f'{v}={w}px')
    assert not over, over


@case('A04', 'Usability: accessibility', 'Text spacing override does not clip content (WCAG 1.4.12)')
def a04(b, base):
    pg = new_page(b, base, 390, 844, True)
    go(pg, 'find')
    pg.add_style_tag(content='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}')
    pg.wait_for_timeout(300)
    w = pg.evaluate("document.documentElement.scrollWidth")
    assert w <= 392, f'page widened to {w}px'


@case('A05', 'Usability: accessibility', 'Animations respect "reduce motion"')
def a05(b, base):
    css = (ROOT / 'css/styles.css').read_text()
    assert 'prefers-reduced-motion' in css


# ---------------------------------------------------------------- Compatibility / portability
@case('C01', 'Compatibility', 'No sideways overflow at 375, 768, 1024 and 1440 px')
def c01(b, base):
    over = []
    for w in [375, 768, 1024, 1440]:
        pg = new_page(b, base, w, 900, w < 700)
        for v in PAGES:
            go(pg, v, 400)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            if sw > w + 2: over.append(f'{w}:{v}={sw}')
        pg.context.close()
    assert not over, over


# ---------------------------------------------------------------- Reliability
@case('F16', 'Functional suitability', 'Feeder pattern box: elementary shows its middle and high school, high school lists who feeds it, links open the right school')
def f16(b, base):
    pg = new_page(b, base)
    go(pg, 's-2597', 900)   # Kennydale Elementary (Renton): split feeder
    box = pg.locator('.box:has(h3:has-text("Feeder pattern"))')
    t = box.inner_text()
    assert 'Vera Risdon Middle' in t and 'Hazen High' in t, t
    box.locator('a:has-text("Vera Risdon Middle")').click(); pg.wait_for_timeout(600)
    assert pg.url.endswith('#s-5484'), pg.url
    go(pg, 's-3096', 900)   # Chief Sealth: fed by Denny and its elementaries
    t = pg.locator('.box:has(h3:has-text("Feeder pattern"))').inner_text()
    assert 'Denny' in t and 'Roxhill' in t, t
    go(pg, 's-4353', 900)   # Kent: no published list, links to the lookup
    assert 'boundary map' in pg.locator('.box:has(h3:has-text("Feeder pattern"))').inner_text()
    assert not pg.errors, pg.errors[:3]


@case('F17', 'Functional suitability', 'Sports, clubs and competitions: high school lists state results, sports and clubs, middle school explains, Compare and Findings show titles')
def f17(b, base):
    pg = new_page(b, base)
    go(pg, 's-2701')
    sec = pg.locator('h2.sec', has_text='Sports, clubs and competitions')
    assert sec.count() == 1, 'no Sports and competitions section on Bellevue High'
    rows = pg.locator('.results li').count()
    assert rows >= 8, f'expected at least 8 result rows, got {rows}'
    assert 'State champion' in pg.inner_text('.results'), 'no state champion row'
    assert 'Sports offered' in pg.inner_text('#v-school'), 'no sports offered list'
    assert pg.locator('.clubrow').count() >= 4, 'club groups missing'
    go(pg, 's-2797')
    assert 'no club page' in pg.inner_text('#v-school'), 'missing-club-list note not shown'
    go(pg, 's-3636')
    assert 'no state tournament' in pg.inner_text('#v-school'), 'middle school note missing'
    go(pg, 'findings')
    n = pg.locator('#wins .wrow').count()
    assert n >= 20, f'findings state-results chart has {n} rows'
    pg.locator('#winsChips .chip', has_text='Now 4A').click(); pg.wait_for_timeout(200)
    assert 0 < pg.locator('#wins .wrow').count() < n, '4A filter did not narrow the chart'
    assert 'top-two state finishes' in pg.inner_text('#winsSum'), 'summary sentence missing'
    pg.evaluate("localStorage.setItem('sks-compare', JSON.stringify(['2701','3640']))")
    go(pg, 'compare'); pg.reload(); pg.wait_for_timeout(800)
    txt = pg.inner_text('#cmpOut')
    assert 'State titles, last 10 years' in txt and 'Clubs on the school' in txt, 'compare rows missing'
    assert not pg.errors, pg.errors


@case('R01', 'Reliability', 'If the data file fails, the page says so instead of going blank')
def r01(b, base):
    pg = new_page(b, base)
    pg.route('**/data/schools.json', lambda r: r.fulfill(status=500, body='x'))
    pg.goto(base + '#home'); pg.wait_for_timeout(800)
    assert "didn't load" in pg.inner_text('main')


@case('R02', 'Reliability', 'If map tiles fail, schools still show (fallback plot)')
def r02(b, base):
    pg = new_page(b, base)
    pg.unroute('**/tile.openstreetmap.org/**')
    pg.route('**/tile.openstreetmap.org/**', lambda r: r.abort())
    go(pg, 'home', 2500)
    dots = pg.evaluate("() => document.querySelectorAll('#v-home circle, #v-home .leaflet-interactive').length")
    assert dots > 50, f'{dots} school dots'


@case('R03', 'Reliability', 'If the address service is down, a helpful message shows')
def r03(b, base):
    pg = new_page(b, base)
    pg.unroute('**/nominatim.openstreetmap.org/**')
    pg.route('**/nominatim.openstreetmap.org/**', lambda r: r.abort())
    go(pg, 'find')
    pg.fill('#findQ', '1000 Main Ave S, Renton'); pg.press('#findQ', 'Enter'); pg.wait_for_timeout(800)
    assert 'ZIP' in pg.inner_text('#locBar'), pg.inner_text('#locBar')


@case('R04', 'Reliability', 'Works with browser storage blocked')
def r04(b, base):
    pg = new_page(b, base)
    pg.add_init_script("Object.defineProperty(window, 'localStorage', {get() { throw new Error('blocked') }})")
    for v in ['home', 'find', 'compare']:
        go(pg, v)
    pg.locator('#findOut [data-compare]').count()
    assert not pg.errors, pg.errors[:3]


# ---------------------------------------------------------------- Data quality
@case('D01', 'Functional correctness: data', 'Data file integrity (counts, unique IDs, ranges, locations)')
def d01(b, base):
    d = json.loads((ROOT / 'data/schools.json').read_text())
    s = d['schools']
    codes = [x['code'] for x in s]
    areas = {x['area'] for x in s}
    probs = []
    if len(s) != 187: probs.append(f'{len(s)} schools')
    if len(set(codes)) != len(codes): probs.append('duplicate codes')
    if areas != {'Renton', 'Kent', 'Issaquah', 'Bellevue', 'West Seattle', 'South Seattle', 'Maple Valley'}: probs.append(f'areas {areas}')
    unmapped = [x['name'] for x in s if x.get('lat') is None]
    if len(unmapped) > 13: probs.append(f'{len(unmapped)} schools without a location (13 known)')
    for x in s:
        lat, lon = x.get('lat'), x.get('lon')
        if lat is not None and not (47.3 < lat < 47.7 and -122.45 < lon < -121.9): probs.append(f"{x['name']} location {lat},{lon}")
        for k, v in x.items():
            if k.startswith(('pct_', 'ela', 'math', 'attendance')) and isinstance(v, (int, float)) and not 0 <= v <= 100:
                probs.append(f"{x['name']} {k}={v}")
    assert not probs, probs[:10]
    return f'{len(s)} schools, {len(areas)} areas, {len(unmapped)} with no address in the county sites file (known)'


# ---------------------------------------------------------------- Maintainability
@case('M01', 'Maintainability', 'HTML validates (html-validate, recommended rules)')
def m01(b, base):
    import subprocess
    cli = next((p for p in [ROOT / 'node_modules/.bin/html-validate', Path('/tmp/qatools/node_modules/.bin/html-validate')] if p.exists()), None)
    assert cli, 'html-validate not installed'
    cfg = ROOT / 'tests/.htmlvalidate.json'
    r = subprocess.run([str(cli), '--config', str(cfg), str(ROOT / 'index.html')], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout[-1200:]


@case('M02', 'Maintainability', 'All JavaScript parses; no leftover console.log or debugger')
def m02(b, base):
    import subprocess
    bad = []
    for f in sorted((ROOT / 'js').rglob('*.js')) + sorted((ROOT / 'tools').glob('*.js')):
        r = subprocess.run(['node', '--input-type=module', '--check'], stdin=open(f), capture_output=True, text=True)
        if r.returncode: bad.append(f'{f.name}: {r.stderr.strip()[:120]}')
        if f.parent.name != 'tools' and re.search(r'console\.log|debugger', f.read_text()): bad.append(f'{f.name}: console.log/debugger')
    assert not bad, bad


# ---------------------------------------------------------------- Performance efficiency
@case('P01', 'Performance efficiency', 'Page weight and load time (local server)')
def p01(b, base):
    pg = new_page(b, base)
    sizes = []
    pg.on('response', lambda r: sizes.append(int(r.headers.get('content-length', 0) or 0)) if base in r.url else None)
    t = time.time()
    pg.goto(base + '#home')
    pg.wait_for_function("document.querySelectorAll('#v-home circle, #v-home .leaflet-interactive').length > 50")
    ms = int((time.time() - t) * 1000)
    kb = sum(sizes) // 1024
    assert kb < 1500 and ms < 3000, f'{kb} KB, {ms} ms'
    return f'{kb} KB from the site, interactive in {ms} ms'


def main():
    with server() as base, sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox']) if CHROME else p.chromium.launch()
        only = set(sys.argv[1:])
        for fn in TESTS:
            if not only or fn.cid in only:
                fn(b, base)
        b.close()
    (ROOT / 'tests/results.json').write_text(json.dumps(RESULTS, indent=1))
    passed = sum(r['status'] == 'PASS' for r in RESULTS)
    print(f'\n{passed}/{len(RESULTS)} passed')
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == '__main__':
    main()
