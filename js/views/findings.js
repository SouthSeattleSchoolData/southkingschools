// Findings page: results vs. low-income share, discipline by group, discipline trend, state titles.

import { store, AREAS, districtByCode } from '../data.js';
import { num, escapeHtml, plain, tidyRange, $, $$ } from '../util.js';
import { incomeTrend, readingMathAverage } from '../scores.js';
import { DISCIPLINE_GROUPS } from '../metrics.js';
import { incomeScatter, pairedBars, trendChart } from '../charts.js';
import { TREND_SERIES, areaSeries } from '../trends.js';
import { renderStateResults } from '../activities.js';

const MEASURES = {
  readingMath: { label: 'Reading + math', unit: '%', yTitle: 'Reading + math proficiency (%)', get: readingMathAverage },
  ela: { label: 'Reading', unit: '%', yTitle: 'Reading proficiency (%)', get: (s) => num(s.ela_proficient) },
  math: { label: 'Math', unit: '%', yTitle: 'Math proficiency (%)', get: (s) => num(s.math_proficient) },
  growth: { label: 'Reading growth', unit: '', yTitle: 'Median reading growth (50 = typical)', get: (s) => num(s.growth_ela) },
  attendance: { label: 'Attendance', unit: '%', yTitle: 'Regular attendance (%)', get: (s) => num(s.regular_attendance) },
  discipline: { label: 'Suspension rate', unit: '%', yTitle: 'Suspended or expelled (%)', get: (s) => num(s.discipline?.all), lowerIsBetter: true },
};

const state = { measure: 'readingMath', highlight: 'Renton', group: 'disability', rec: 'math', recLevel: '' };

export function renderFindings() {
  renderScatter();
  renderRecovery();
  renderDisciplineGroups();
  renderTrend();
  renderStateResults();
}

function chips(el, options, current, onPick) {
  el.innerHTML = options.map(([k, l]) => `<button class="chip${k === current ? ' on' : ''}" data-k="${k}" type="button" aria-pressed="${k === current}">${l}</button>`).join('');
  $$('.chip', el).forEach((b) => b.addEventListener('click', () => onPick(b.dataset.k)));
}

function renderScatter() {
  const m = MEASURES[state.measure];
  chips($('#eqChips'), Object.entries(MEASURES).map(([k, v]) => [k, v.label]), state.measure, (k) => { state.measure = k; renderFindings(); });

  const select = $('#eqArea');
  if (!select.options.length) {
    ['None', ...AREAS].forEach((a) => select.add(new Option(a === 'None' ? 'No area' : a, a)));
    select.value = state.highlight;
    select.addEventListener('change', () => { state.highlight = select.value; renderScatter(); });
  }

  const eligible = store.schools.filter((s) => s.scores);
  const trend = incomeTrend(eligible, m.get);
  const points = trend.points.map((p) => ({ ...p, res: p.y - (trend.a + trend.b * p.x) }));
  incomeScatter($('#eqSvg'), points, trend, { label: m.label, unit: m.unit, yTitle: m.yTitle, highlight: state.highlight });

  $('#eqLegend').innerHTML = (state.highlight !== 'None'
    ? `<span><i style="background:var(--hl)"></i>${state.highlight}</span><span><i style="background:var(--d1);opacity:.4"></i>Other areas</span>`
    : '<span><i style="background:var(--d1)"></i>All schools</span>')
    + `<span>Dashed line: trend (R² ${trend.r2.toFixed(2)}). ${m.lowerIsBetter ? 'Below the line is better.' : 'Above the line beats expectations.'}</span>`;

  const direction = m.lowerIsBetter ? -1 : 1;
  const ranked = [...points].sort((a, b) => direction * (b.res - a.res));
  const item = (p) => `<a href="#s-${p.s.code}">${escapeHtml(p.s.name)}<span>${p.s.area}, ${p.x}% low-income, ${Math.abs(p.res).toFixed(1)} points ${p.res >= 0 ? 'above' : 'below'}</span></a>`;
  $('#eqTop').innerHTML = ranked.slice(0, 10).map(item).join('');
  $('#eqBot').innerHTML = ranked.slice(-10).reverse().map(item).join('');
}

function renderDisciplineGroups() {
  chips($('#dgChips'), DISCIPLINE_GROUPS, state.group, (k) => { state.group = k; renderDisciplineGroups(); });
  const label = DISCIPLINE_GROUPS.find(([k]) => k === state.group)[1];

  const rows = [['Renton', 'R'], ['Kent', 'K'], ['Seattle', 'S'], ['Tahoma', 'T'], ['Issaquah', 'I'], ['Bellevue', 'B']].map(([name, code]) => {
    const d = districtByCode(code).discipline;
    const suppressed = typeof d.all === 'string' || typeof d[state.group] === 'string';
    return {
      label: name,
      all: num(d.all),
      group: num(d[state.group]),
      // Suppressed values show as their range text and skip the ratio.
      allText: suppressed ? plain(d.all, '%') : undefined,
      groupText: suppressed ? plain(d[state.group], '%') : undefined,
    };
  });
  pairedBars($('#dgSvg'), rows, label);
}

/** Count of schools now below their 2018-19 level, for the summary sentence. */
function belowCount(key) {
  const pairs = store.schools.filter((s) => s.trend && !s.isProgram).map((s) => [s.trend[key][0], s.trend[key][s.trend[key].length - 1]])
    .filter(([a, b]) => typeof a === 'number' && typeof b === 'number');
  return { below: pairs.filter(([a, b]) => b < a).length, of: pairs.length };
}

function renderRecovery() {
  if (!store.trendYears.length) return;
  const last = store.trendYears[store.trendYears.length - 1];
  const r = belowCount('ela');
  const m = belowCount('math');
  const a = belowCount('att');
  $('#recoverySum').textContent = `Comparing ${last} with 2018-19, the last year before the pandemic: ${r.below} of ${r.of} schools are still below their reading level, ${m.below} of ${m.of} below their math level, and ${a.below} of ${a.of} have fewer students attending regularly.`;
  chips($('#recChips'), TREND_SERIES.map(([k, label]) => [k, label]), state.rec, (k) => { state.rec = k; renderRecovery(); });
  chips($('#recLevel'), [['', 'All schools'], ['Elementary', 'Elementary'], ['Middle', 'Middle'], ['High', 'High']], state.recLevel, (k) => { state.recLevel = k; renderRecovery(); });
  const [, , yTitle, yMax] = TREND_SERIES.find(([k]) => k === state.rec);
  trendChart($('#recSvg'), store.trendYears, areaSeries(state.rec, state.recLevel), { yTitle, yMax, height: 320, maxWidth: 900 });
}

function renderTrend() {
  const t = store.disciplineTrend || store.meta.discipline_trend;
  $('#trendTbl').innerHTML = `<thead><tr><th>District</th>${t.years.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>`
    + t.rows.map((r) => `<tr${r.reference ? ' class="ref"' : ''}><td>${r.name}</td>${r.values.map((v) => `<td>${escapeHtml(typeof v === 'string' && /^[<>]/.test(v) ? tidyRange(v) : v)}%</td>`).join('')}</tr>`).join('')
    + '</tbody>';
}
