// Home page: hero search over a map, four findings, and the area table.

import { store, AREAS, AREA_DISTRICT, districtByCode } from '../data.js';
import { num, escapeHtml, cssVar, round1, cleanText, searchKey, matchesWords, guardInput, $, $$ } from '../util.js';
import { readingMathAverage, scoreColorVar } from '../scores.js';
import { createMap, addSchoolDots, drawDotPlot } from '../maps.js';
import { incomeScatter, pairedBars, expectedVsActual } from '../charts.js';
import { scoreRamp } from '../components.js';
import { geocode, browserLocation, userLocation } from '../geo.js';
import { findState } from './find.js';
import { info } from '../glossary.js';

let searchWired = false;

export function renderHome() {
  const students = store.schools.reduce((t, s) => t + (s.enrollment || 0), 0);
  $('#heroStats').innerHTML = `<div><b class="num">${store.schools.length}</b>schools</div><div><b class="num">${Math.round(students / 1000)}k</b>students</div><div><b class="num">40+</b>measures each</div>`;
  drawHeroMap();
  if (!searchWired) {
    wireHeroSearch();
    searchWired = true;
  }
  renderFindings();
  renderAreaTable();
}

// ---------- Hero map ----------

function drawHeroMap() {
  const box = $('#heroMap');
  const mapped = store.schools.filter((s) => s.lat);
  box.innerHTML = `<div class="lmap" id="heroLeaflet"></div><div class="xs muted legendov" style="display:flex;gap:6px;align-items:center">Academics score ${scoreRamp()}</div>`;
  const tipOf = (s) => `<b>${escapeHtml(s.name)}</b>${s.area}, grades ${s.grades}<br>Academics ${s.scores?.academics ?? '—'}`;

  const map = createMap('hero', $('#heroLeaflet'), () => {
    const el = $('#heroLeaflet');
    const width = el.clientWidth || 500;
    const height = el.clientHeight || 440;
    drawDotPlot(el, mapped, {
      width, height, tipOf,
      colorVarOf: (s) => scoreColorVar(s.scores?.academics),
      labels: AREAS.map((a) => {
        const inArea = mapped.filter((s) => s.area === a);
        return { text: a, at: { lat: inArea.reduce((t, s) => t + s.lat, 0) / inArea.length, lon: inArea.reduce((t, s) => t + s.lon, 0) / inArea.length } };
      }),
    });
  });
  if (!map) return;
  const layer = addSchoolDots(map, mapped, (s) => cssVar(scoreColorVar(s.scores?.academics)), tipOf);
  map.fitBounds(layer.getBounds(), { padding: [16, 16] });
}

// ---------- Hero search ----------

function wireHeroSearch() {
  const input = $('#heroQ');
  const list = $('#heroSuggest');
  const msg = $('#heroMsg');
  let active = -1;
  let matches = [];

  const close = () => { list.classList.remove('on'); active = -1; };

  guardInput(input, msg);
  input.addEventListener('input', () => {
    const q = searchKey(input.value);
    if (q.length < 2 || /^\d/.test(q)) { close(); return; }
    matches = store.schools.filter((s) => matchesWords(s.name, q)).slice(0, 6);
    list.innerHTML = matches.map((s, i) => `<button type="button" role="option" data-i="${i}">${escapeHtml(s.name)}<span>${escapeHtml(s.area)}, ${escapeHtml(s.grades)}</span></button>`).join('');
    list.classList.toggle('on', matches.length > 0);
    $$('button', list).forEach((b) => b.addEventListener('click', () => { location.hash = `s-${matches[+b.dataset.i].code}`; }));
  });

  input.addEventListener('keydown', (e) => {
    const buttons = $$('button', list);
    if (!buttons.length) return;
    if (e.key === 'ArrowDown') { active = Math.min(buttons.length - 1, active + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); return; }
    else return;
    buttons.forEach((b, i) => b.classList.toggle('act', i === active));
  });

  $('#heroForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = cleanText(input.value).trim();
    if (!q) return;
    const buttons = $$('button', list);
    if (active >= 0 && buttons[active]) { buttons[active].click(); return; }

    const nameHits = store.schools.filter((s) => matchesWords(s.name, q));
    if (nameHits.length === 1) { location.hash = `s-${nameHits[0].code}`; return; }
    if (nameHits.length > 1 && !/\d/.test(q)) {
      findState.query = q;
      userLocation.set(null);
      location.hash = 'find';
      return;
    }
    msg.textContent = 'Looking up that address…';
    try {
      const loc = await geocode(q);
      if (!loc) { msg.textContent = 'No match in this area. Try a street address with a city, or a ZIP code.'; return; }
      userLocation.set(loc);
      findState.query = '';
      findState.sort = 'distance';
      msg.textContent = '';
      location.hash = 'find';
    } catch {
      msg.textContent = "Address lookup isn't reachable from this page. Try a ZIP code.";
    }
  });

  $('#heroLoc').addEventListener('click', async () => {
    msg.textContent = 'Finding you…';
    try {
      userLocation.set(await browserLocation());
      findState.sort = 'distance';
      msg.textContent = '';
      location.hash = 'find';
    } catch (err) {
      msg.textContent = `${err.message} You can type a ZIP code instead.`;
    }
  });

  document.addEventListener('click', (e) => { if (!e.target.closest('#heroSuggest') && e.target !== input) close(); });
}

// ---------- Findings ----------

function renderFindings() {
  const trend = store.trend;
  const beatOdds = store.schools
    .filter((s) => s.resid != null && s.level !== 'High')
    .sort((a, b) => b.resid - a.resid)
    .slice(0, 3);

  $('#findingsHome').innerHTML = `
  <div class="finding">
    <div>
      <h3>Family income predicts most of a school's test scores.</h3>
      <p>Across these schools, the share of low-income students explains about ${Math.round(trend.r2 * 100)}% of the variation in reading and math proficiency. Each 10-point rise in low-income share comes with about ${Math.abs(trend.b * 10).toFixed(0)} fewer points of proficiency. Ranking schools on raw scores mostly ranks neighborhoods.</p>
      <p><a href="#findings">See every school against the trend</a></p>
    </div>
    <div class="chartbox"><div id="fScatter"></div><div class="legend"><span><i style="background:var(--d1)"></i>Each dot is a school</span><span>Dashed line: the trend</span></div></div>
  </div>
  <div class="finding">
    <div>
      <h3>Some schools beat their odds by 20 points or more.</h3>
      <p>${beatOdds.map((s) => `<a href="#s-${s.code}">${escapeHtml(s.name)}</a>`).join(', ')} score far above what their low-income share predicts. That gap is where instruction shows up. The Equity score on each school page is built from it.</p>
    </div>
    <div class="chartbox" id="fBeat"></div>
  </div>
  <div class="finding">
    <div>
      <h3>Students with disabilities are suspended at two to four times the average rate.</h3>
      <p>In every district here, students with disabilities lose more days to suspension and expulsion than their classmates. A high ratio usually means behavior support plans aren't working, and those students fall further behind with each removal.</p>
      <p><a href="#findings">See other student groups</a></p>
    </div>
    <div class="chartbox" id="fSwd"></div>
  </div>
  <div class="finding">
    <div>
      <h3>Most serious violence happens near schools, not inside them.</h3>
      <p>The fatal shootings of students since 2024 happened at bus stops, parks and community centers next to Rainier Beach, Chief Sealth and Kent-Meridian. The schools themselves reported few weapons incidents. For families, the commute and after-school hours matter as much as the building.</p>
      <p><a href="#safety">See the incident timeline and records</a></p>
    </div>
    <div class="chartbox"><ul class="timeline" id="fNews"></ul></div>
  </div>`;

  incomeScatter($('#fScatter'), trend.points.map((p) => ({ ...p, res: p.y - (trend.a + trend.b * p.x) })), trend, {
    label: 'Reading + math', unit: '%', yTitle: 'Reading + math proficiency (%)', height: 320,
  });

  expectedVsActual($('#fBeat'), beatOdds.map((s) => {
    const li = num(s.pct_low_income);
    return { name: s.name, lowIncome: li, expected: trend.a + trend.b * li, actual: readingMathAverage(s) };
  }));

  const names = { R: 'Renton', K: 'Kent', I: 'Issaquah', S: 'Seattle', T: 'Tahoma' };
  pairedBars($('#fSwd'), Object.entries(names).map(([code, label]) => {
    const d = districtByCode(code);
    return { label, all: num(d.discipline.all), group: num(d.discipline.disability) };
  }), 'Students with disabilities');

  $('#fNews').innerHTML = store.news.slice(0, 4).map((n) => {
    const firstSentence = n.text.split('. ')[0].replace(/\.$/, '');
    return `<li><div class="d">${n.date}, ${n.area}</div><div class="small">${escapeHtml(firstSentence)}.</div></li>`;
  }).join('');
}

// ---------- Area table ----------

/** District totals where an area is a whole district; enrollment-weighted school averages for Seattle areas. */
function areaStats(area) {
  const inArea = store.schools.filter((s) => s.area === area);
  const district = AREA_DISTRICT[area] ? districtByCode(AREA_DISTRICT[area]) : null;
  const weighted = (get) => {
    let total = 0;
    let weight = 0;
    for (const s of inArea) {
      const v = num(get(s));
      if (v != null && s.enrollment) { total += v * s.enrollment; weight += s.enrollment; }
    }
    return weight ? total / weight : null;
  };
  const value = (get) => (district ? num(get(district)) : weighted(get));
  return {
    count: inArea.length,
    estimated: !district,
    pct_low_income: value((x) => x.pct_low_income),
    ela_proficient: value((x) => x.ela_proficient),
    math_proficient: value((x) => x.math_proficient),
    growth_ela: value((x) => x.growth_ela),
    discipline_all: value((x) => x.discipline?.all),
    regular_attendance: value((x) => x.regular_attendance),
    grad_rate_4yr: value((x) => x.grad_rate_4yr),
  };
}

function renderAreaTable() {
  const cols = [
    ['pct_low_income', 'Low-income', '%'],
    ['ela_proficient', 'Reading', '%'],
    ['math_proficient', 'Math', '%'],
    ['growth_ela', 'Growth (reading)', ''],
    ['discipline_all', 'Suspended/expelled', '%'],
    ['regular_attendance', 'Regular attendance', '%'],
    ['grad_rate_4yr', '4-yr graduation', '%'],
  ];
  const cell = (key, v, unit) => {
    if (v == null) return '—';
    if (key === 'discipline_all' && v < 0.05) return '&lt;0.05%';
    return round1(v) + unit;
  };
  const rows = AREAS.map((area) => {
    const st = areaStats(area);
    return `<tr><td><a href="#find" data-area="${area}">${area}</a>${st.estimated ? ' <span class="xs muted">est.</span>' : ''}</td><td>${st.count}</td>${cols.map(([k, , u]) => `<td>${cell(k, st[k], u)}</td>`).join('')}</tr>`;
  });
  const state = store.state;
  const stateVals = { pct_low_income: state.pct_low_income, ela_proficient: state.ela_proficient, math_proficient: state.math_proficient, discipline_all: state.discipline_all, regular_attendance: state.regular_attendance, grad_rate_4yr: state.grad_rate_4yr };
  rows.push(`<tr class="ref"><td>Washington State</td><td></td>${cols.map(([k, , u]) => `<td>${stateVals[k] != null ? stateVals[k] + u : ''}</td>`).join('')}</tr>`);

  $('#areaTbl').innerHTML = `<thead><tr><th>Area</th><th>Schools</th>${cols.map(([k, l]) => `<th>${l}${info(k)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
  $$('#areaTbl [data-area]').forEach((a) => a.addEventListener('click', () => { findState.areas = new Set([a.dataset.area]); }));
}
