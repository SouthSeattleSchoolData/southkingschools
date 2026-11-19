// Find schools: filters, sort, and List / Map / Table views. Distance sorting when a location is set.

import { store, AREAS } from '../data.js';
import { num, fmt, plain, escapeHtml, cssVar, round1, cleanText, searchKey, matchesWords, guardInput, $, $$ } from '../util.js';
import { SCORE_NAMES } from '../scores.js';
import { METRICS } from '../metrics.js';
import { scoreBars, tagList, scoreRamp } from '../components.js';
import { compareButton, wireCompareButtons } from '../compare-list.js';
import { geocode, milesBetween, userLocation } from '../geo.js';
import { info, glossaryKey } from '../glossary.js';
import { createMap, addSchoolDots, drawDotPlot } from '../maps.js';

const LEVELS = ['Elementary', 'Middle', 'High', 'K-8 / 6-12'];
const PAGE_SIZE = 30;

const SORTS = {
  academics: 'Academics score',
  growth: 'Growth score',
  equity: 'Equity score',
  climate: 'Climate score',
  distance: 'Distance',
  name: 'Name',
  enrollment: 'Enrollment',
  pct_low_income: 'Low-income share',
};

const MAP_SHADES = {
  academics: 'Academics score',
  growth: 'Growth score',
  equity: 'Equity score',
  climate: 'Climate score',
  pct_low_income: 'Low-income share',
  discipline_all: 'Suspension rate',
};

/** Shared with the home page so its search can pre-set filters. */
export const findState = {
  areas: new Set(AREAS),
  levels: new Set(LEVELS),
  include: new Set(['charter', 'alternative']),
  sort: 'academics',
  query: '',
  view: 'list',
  limit: PAGE_SIZE,
  mapShade: 'academics',
};

let wired = false;

export function renderFind() {
  if (!wired) {
    wireControls();
    wired = true;
  }
  $('#findQ').value = findState.query;
  renderFilters();
  renderLocationBar();
  renderResults();
}

function wireControls() {
  $('#filterToggle').addEventListener('click', (e) => {
    const open = $('#rail').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
  });
  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
    findState.view = b.dataset.v;
    renderFind();
  }));

  const input = $('#findQ');
  guardInput(input, $('#findHint'));
  input.addEventListener('input', () => {
    if (/\d/.test(input.value)) return; // addresses/ZIPs wait for submit
    findState.query = input.value;
    findState.limit = PAGE_SIZE;
    renderResults();
  });

  $('#findForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = cleanText(input.value).trim();
    if (!/\d/.test(q)) {
      findState.query = q;
      renderResults();
      return;
    }
    const bar = $('#locBar');
    bar.hidden = false;
    bar.textContent = 'Looking up that address…';
    try {
      const loc = await geocode(q);
      if (!loc) { bar.textContent = 'No match in this area. Try a street address with a city, or a ZIP code.'; return; }
      userLocation.set(loc);
      findState.query = '';
      input.value = '';
      findState.sort = 'distance';
      renderFind();
    } catch {
      bar.textContent = "Address lookup isn't reachable from this page. A ZIP code works anywhere.";
    }
  });

  $('#fSort').addEventListener('change', (e) => {
    findState.sort = e.target.value;
    renderResults();
  });
}

function checkbox(attr, value, label, checked, count) {
  return `<label><input type="checkbox" ${attr}="${value}"${checked ? ' checked' : ''}>${label}${count != null ? `<span class="ct">${count}</span>` : ''}</label>`;
}

function renderFilters() {
  const count = (fn) => store.schools.filter(fn).length;
  $('#fArea').innerHTML = AREAS.map((a) => checkbox('data-area', a, a, findState.areas.has(a), count((s) => s.area === a))).join('');
  $('#fLevel').innerHTML = LEVELS.map((l) => checkbox('data-level', l, l, findState.levels.has(l), count((s) => s.level === l))).join('');
  const includeCounts = {
    charter: count((s) => s.is_charter),
    alternative: count((s) => s.school_type === 'A'),
    programs: count((s) => s.isProgram || ['Preschool', 'Other'].includes(s.level)),
  };
  $('#fInc').innerHTML = [
    ['charter', 'Charter schools'],
    ['alternative', 'Alternative schools'],
    ['programs', 'Special programs & online'],
  ].map(([k, l]) => checkbox('data-include', k, l, findState.include.has(k), includeCounts[k])).join('');

  const toggle = (set, value, on) => (on ? set.add(value) : set.delete(value));
  $$('#fArea input').forEach((i) => i.addEventListener('change', () => { toggle(findState.areas, i.dataset.area, i.checked); findState.limit = PAGE_SIZE; renderResults(); }));
  $$('#fLevel input').forEach((i) => i.addEventListener('change', () => { toggle(findState.levels, i.dataset.level, i.checked); findState.limit = PAGE_SIZE; renderResults(); }));
  $$('#fInc input').forEach((i) => i.addEventListener('change', () => { toggle(findState.include, i.dataset.include, i.checked); findState.limit = PAGE_SIZE; renderResults(); }));

  const loc = userLocation.get();
  if (findState.sort === 'distance' && !loc) findState.sort = 'academics';
  $('#fSort').innerHTML = Object.entries(SORTS)
    .filter(([k]) => k !== 'distance' || loc)
    .map(([k, l]) => `<option value="${k}"${findState.sort === k ? ' selected' : ''}>${l}</option>`)
    .join('');
  $$('#viewSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === findState.view);
    b.setAttribute('aria-pressed', b.dataset.v === findState.view);
  });
}

function renderLocationBar() {
  const bar = $('#locBar');
  const loc = userLocation.get();
  if (!loc) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `Sorted by distance from <b>${escapeHtml(loc.label)}</b>${loc.approx ? ' (ZIP center)' : ''}. Nearest isn't always the assigned school; check your district's boundary map. <button class="linkbtn" id="clearLoc" type="button">Clear</button>`;
  $('#clearLoc').addEventListener('click', () => {
    userLocation.set(null);
    if (findState.sort === 'distance') findState.sort = 'academics';
    renderFind();
  });
}

function matchingSchools(inc = findState.include) {
  const q = searchKey(findState.query);
  return store.schools.filter((s) => {
    const levelOk = findState.levels.has(s.level) || (['Preschool', 'Other'].includes(s.level) && inc.has('programs'));
    return findState.areas.has(s.area)
      && levelOk
      && (!s.is_charter || inc.has('charter'))
      && (s.school_type !== 'A' || inc.has('alternative'))
      && (!s.isProgram || inc.has('programs'))
      && (!q || matchesWords(s.name, q) || String(s.zip).includes(q));
  });
}

function sortSchools(list) {
  const key = findState.sort;
  const loc = userLocation.get();
  list.forEach((s) => { s.distance = loc && s.lat ? milesBetween(loc, s) : null; });
  if (key === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
  const value = (s) => {
    if (key === 'distance') return s.distance;
    if (key in SCORE_NAMES) return s.scores?.[key] ?? null;
    return num(s[key]);
  };
  return list.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    return key === 'distance' ? va - vb : vb - va;
  });
}

function renderResults() {
  const list = sortSchools(matchingSchools());
  const out = $('#findOut');
  $('#findTitle').textContent = findState.areas.size === AREAS.length ? 'All schools' : [...findState.areas].join(', ');
  const hiddenPrograms = findState.include.has('programs') ? 0 : matchingSchools(new Set([...findState.include, 'programs'])).length - list.length;
  // Each sentence is its own element so the translations can match it whole.
  $('#findCount').innerHTML = `<span>${list.length} ${list.length === 1 ? 'school' : 'schools'}, sorted by ${SORTS[findState.sort].toLowerCase()}</span>`
    + (hiddenPrograms > 0 ? `. <span>${hiddenPrograms} preschool, online and special program ${hiddenPrograms === 1 ? 'site is' : 'sites are'} hidden.</span> <button class="linkbtn" id="showPrograms" type="button">Show ${hiddenPrograms === 1 ? 'it' : 'them'}</button>` : '');
  $('#showPrograms')?.addEventListener('click', () => {
    findState.include.add('programs');
    renderFind();
  });

  if (!list.length) {
    out.innerHTML = '<div class="empty">No schools match. Turn on more areas or levels in the filters.</div>';
    return;
  }
  out.dataset.view = findState.view;
  if (findState.view === 'map') renderMapView(out, list);
  else if (findState.view === 'table') renderTableView(out, list);
  else renderListView(out, list);
}

// ---------- List view ----------

function resultRow(s) {
  const showDistance = s.distance != null && userLocation.get();
  return `<div class="res" data-code="${s.code}">
    <div>
      <div class="rname"><a href="#s-${s.code}">${escapeHtml(s.name)}</a>${tagList(s)}</div>
      <div class="rmeta">${showDistance ? `<span class="dist">${s.distance.toFixed(1)} mi</span> · ` : ''}${s.area} · grades ${s.grades} · ${s.enrollment.toLocaleString()} students</div>
      <div class="rfacts">
        <span>Reading <b>${plain(s.ela_proficient, '%')}</b></span>
        <span>Math <b>${plain(s.math_proficient, '%')}</b></span>
        <span>Low-income <b>${plain(s.pct_low_income, '%')}</b></span>
        ${s.regular_attendance != null ? `<span>Regular attendance <b>${plain(s.regular_attendance, '%')}</b></span>` : ''}
      </div>
      ${compareButton(s.code)}
    </div>
    <div>${scoreBars(s)}</div>
  </div>`;
}

function renderListView(out, list) {
  const remaining = list.length - findState.limit;
  out.innerHTML = `<p class="xs muted" style="margin:0 0 4px">Scores run 0–100 and compare each school with same-level schools here. Hover or tap ⓘ anywhere for a definition, or see the <a href="#glossary">Glossary</a>.</p>`
    + list.slice(0, findState.limit).map(resultRow).join('')
    + (remaining > 0 ? `<button class="btn ghost more" id="moreBtn" type="button">Show ${Math.min(PAGE_SIZE, remaining)} more of ${remaining}</button>` : '');

  // The school name is the real link (keyboard and screen readers); a click anywhere else on the card opens it too.
  $$('.res', out).forEach((row) => {
    row.addEventListener('click', (e) => {
      if (!e.target.closest('a, button')) location.hash = `s-${row.dataset.code}`;
    });
  });
  wireCompareButtons(out);
  $('#moreBtn')?.addEventListener('click', () => { findState.limit += PAGE_SIZE; renderResults(); });
}

// ---------- Map view ----------

function shadeValue(s) {
  const key = findState.mapShade;
  if (key in SCORE_NAMES) return s.scores?.[key] ?? null;
  return num(METRICS[key].get(s));
}

function renderMapView(out, list) {
  out.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <label class="small muted" for="mapShade">Shade by</label>
      <select id="mapShade" style="width:auto">${Object.entries(MAP_SHADES).map(([k, l]) => `<option value="${k}"${k === findState.mapShade ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <span class="ramp" id="mapRamp"></span>
    </div>
    <div class="mapwrap"><div id="findMap" class="fmap"></div></div>
    <p class="xs muted" style="margin-top:6px">School locations from King County's school-site layer. Tap a dot to open the school; scroll-zoom turns on after you click the map.</p>`;
  $('#mapShade').addEventListener('change', (e) => { findState.mapShade = e.target.value; renderMapView(out, list); });

  const mapped = list.filter((s) => s.lat);
  const isScore = findState.mapShade in SCORE_NAMES;
  const values = mapped.map(shadeValue).filter((v) => v != null).sort((a, b) => a - b);
  // Scores use fixed 20-point bands; other measures use quintiles of what's shown.
  const breaks = isScore ? [20, 40, 60, 80] : [0.2, 0.4, 0.6, 0.8].map((p) => values[Math.floor(p * (values.length - 1))]);
  const steps = ['--q1', '--q2', '--q3', '--q4', '--q5'];
  const colorVar = (s) => {
    const v = shadeValue(s);
    return v == null ? '--mute' : steps[breaks.filter((b) => v >= b).length];
  };
  const unit = isScore ? '' : '%';
  const tipOf = (s) => `<b>${escapeHtml(s.name)}</b>${s.area}, grades ${s.grades}<br>${MAP_SHADES[findState.mapShade]}: ${shadeValue(s) == null ? '—' : round1(shadeValue(s)) + unit}${s.distance != null && userLocation.get() ? `<br>${s.distance.toFixed(1)} mi away` : ''}`;

  const range = isScore ? '0 → 100' : `${round1(values[0])} → ${round1(values[values.length - 1])}%`;
  $('#mapRamp').innerHTML = `${scoreRamp()} <span>${range}</span>`
    + (userLocation.get() ? ' <span style="margin-left:8px"><i style="background:none;border:2px solid var(--hl);border-radius:50%;width:10px;height:10px"></i> you</span>' : '');

  const el = $('#findMap');
  const map = createMap('find', el, () => {
    el.className = '';
    const width = el.clientWidth || 700;
    drawDotPlot(el, mapped, {
      width, height: Math.min(640, Math.max(360, width * 0.95)),
      colorVarOf: colorVar, tipOf, extentSchools: store.schools.filter((s) => s.lat),
    });
  });
  if (!map) return;

  const layer = addSchoolDots(map, mapped, (s) => cssVar(colorVar(s)), tipOf);
  const loc = userLocation.get();
  if (loc) {
    window.L.circleMarker([loc.lat, loc.lon], { radius: 8, color: cssVar('--hl'), weight: 3, fillOpacity: 0 })
      .bindTooltip(`You: ${escapeHtml(loc.label)}`).addTo(map);
    const nearest = [...mapped].sort((a, b) => a.distance - b.distance).slice(0, 8);
    map.fitBounds(window.L.latLngBounds([[loc.lat, loc.lon], ...nearest.map((s) => [s.lat, s.lon])]), { padding: [30, 30] });
  } else if (mapped.length) {
    map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  }
}

// ---------- Table view ----------

const TABLE_COLUMNS = [
  ['academics', 'Acad.'], ['growth', 'Growth'], ['equity', 'Equity'], ['climate', 'Climate'],
  ['enrollment', 'Students'], ['pct_low_income', 'Low-inc %'], ['ela_proficient', 'Reading %'], ['math_proficient', 'Math %'],
  ['science_proficient', 'Science %'], ['growth_ela', 'Growth rdg'], ['regular_attendance', 'Attend. %'],
  ['discipline_all', 'Suspend. %'], ['discipline_disability', 'Disab. susp. %'], ['grad_rate_4yr', 'Grad %'],
];

function renderTableView(out, list) {
  const showDistance = !!userLocation.get();
  const cell = (s, key) => (key in SCORE_NAMES ? s.scores?.[key] ?? null : METRICS[key].get(s));
  const columns = TABLE_COLUMNS.filter(([k]) => list.some((s) => { const v = cell(s, k); return v != null && v !== ''; }));
  const head = `<tr><th>School</th>${showDistance ? '<th>Miles</th>' : ''}${columns.map(([k, l]) => `<th>${l}${info(glossaryKey(k))}</th>`).join('')}</tr>`;
  const body = list.map((s) => `<tr>
      <td><a href="#s-${s.code}">${escapeHtml(s.name)}</a><div class="xs muted">${s.area}, ${s.grades}</div></td>
      ${showDistance ? `<td>${s.distance != null ? s.distance.toFixed(1) : '—'}</td>` : ''}
      ${columns.map(([k]) => `<td>${fmt(cell(s, k), '', { dp: METRICS[k]?.unit === '%' ? 1 : undefined })}</td>`).join('')}
    </tr>`).join('');
  out.innerHTML = `<div class="scroll" style="border:1px solid var(--line);border-radius:12px;background:var(--surface);--tbl-bg:var(--surface)"><table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="xs muted" style="margin-top:6px">Gray values are privacy-suppressed ranges from OSPI. Use the Sort menu to reorder.</p>`;
}

