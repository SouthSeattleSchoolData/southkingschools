// School profile page: scores, interpretation, measures, trends, discipline, demographics,
// safety and support staff, teachers and spending, lead testing, nearby schools.

import { store, districtFor, districtLabel } from '../data.js';
import { num, fmt, plain, round1, escapeHtml, cssVar, $ } from '../util.js';
import { SCORE_NAMES, scoreColorVar } from '../scores.js';
import { METRICS, INCIDENTS, RESTRAINT, BULLYING_BASES, STAFF_ROLES, STAFF_GUIDES, CRDC_YEAR, CRDC_PREV_YEAR, incidentPrev, DISCIPLINE_GROUPS, DEMOGRAPHICS, incident, perStaff } from '../metrics.js';
import { TREND_SERIES, peerSeries, smallSchoolCaution, changeSummary } from '../trends.js';
import { interpretSchool, tourQuestions } from '../insights.js';
import { compareButton, wireCompareButtons } from '../compare-list.js';
import { milesBetween } from '../geo.js';
import { createMap, addSchoolDots } from '../maps.js';
import { disciplineBars, demographicsBar, trendChart } from '../charts.js';
import { tagList } from '../components.js';
import { info, glossaryKey } from '../glossary.js';
import { reportUrl } from '../feedback.js';

/** Order of student groups in the profile's discipline chart. */
const PROFILE_GROUP_ORDER = ['disability', 'low_income', 'black', 'hispanic', 'white', 'asian'];

/** Maps metric keys to the state benchmark field names in schools.json. */
const STATE_KEYS = {
  ela_proficient: 'ela_proficient',
  math_proficient: 'math_proficient',
  science_proficient: 'science_proficient',
  regular_attendance: 'regular_attendance',
  grad_rate_4yr: 'grad_rate_4yr',
  ninth_grade_on_track: 'ninth_grade_on_track',
  dual_credit: 'dual_credit',
  pct_low_income: 'pct_low_income',
};

function measure(school, district, key, { showEmpty = false } = {}) {
  const m = METRICS[key];
  const v = m.get(school);
  if ((v == null || v === '') && !showEmpty) return '';
  const dv = district ? m.get(district) : null;
  const sv = STATE_KEYS[key] ? store.state[STATE_KEYS[key]] : null;
  const notes = [];
  if (dv != null && dv !== '') notes.push(`District ${plain(dv, m.unit)}`);
  if (sv != null) notes.push(`state ${sv}${m.unit}`);
  return `<div class="kv"><div class="k">${m.label}${info(glossaryKey(key))}</div><div class="v num">${fmt(v, m.unit)}</div><div class="c">${notes.join(', ')}</div></div>`;
}

function scorePanel(s) {
  if (!s.scores) {
    return '<div class="small muted" style="grid-column:1/-1">Not scored. Special programs and very small schools aren\'t comparable to neighborhood schools.</div>';
  }
  const peers = s.peerGroup === 'Mixed' ? 'schools' : `${s.peerGroup.toLowerCase()} schools`;
  return Object.entries(SCORE_NAMES).map(([key, name]) => {
    const v = s.scores[key];
    let detail = `Better than ${v}% of ${peers} here`;
    if (v == null) detail = key === 'growth' && s.level === 'High' ? 'Not measured in high school' : 'Not enough data';
    return `<div class="bigscore" style="border-top-color:var(${scoreColorVar(v)})"><div class="v num">${v ?? '—'}</div><div class="k">${name}${info(`score:${key}`)}</div><div class="d">${detail}</div></div>`;
  }).join('');
}

function nearbySchools(s, count = 5) {
  if (!s.lat) return [];
  return store.schools
    .filter((x) => x !== s && x.lat && x.level === s.level && !x.isProgram)
    .map((x) => ({ school: x, miles: milesBetween(s, x) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}

const LEAD_URL = 'https://doh.wa.gov/community-and-environment/drinking-water/contaminants/lead/lead-schools/test-results-2022';

/** Safety incidents, bullying, restraint and police contact from the federal CRDC. */
function safetySection(s) {
  const c = s.crdc;
  if (!c) return `<p class="small muted">No ${CRDC_YEAR} federal record for this school. It may have opened later or reported under another name.</p>`;
  const was = (k) => { const p = incidentPrev(s, k); return p == null ? '' : `<div class="c">${CRDC_PREV_YEAR}: ${p}</div>`; };
  const cell = (label, v, key, k) => `<div class="kv"><div class="k">${label}${key ? info(`incident:${key}`) : ''}</div><div class="v num">${fmt(v)}</div>${was(k)}</div>`;
  const bases = BULLYING_BASES.filter(([k]) => (c.bullying?.[k] || 0) > 0).map(([k, label]) => `${c.bullying[k]} based on ${label}`);
  const restraint = RESTRAINT.map(([k, label]) => [label, c[k], k]).filter(([, v]) => v != null);
  return `<div class="kgrid">${INCIDENTS.map(([key, label]) => cell(label, incident(s, key), key, key)).join('')}
      ${restraint.map(([label, v, k], i) => cell(label, v, i === 0 ? 'restraint' : '', k)).join('')}</div>
    <p class="small">${c.harassment_allegations ? `Bullying and harassment allegations: ${bases.join('; ') || c.harassment_allegations}.` : 'No bullying or harassment allegations on a protected basis were reported.'}</p>
    ${c.suspect?.includes('threats') ? `<p class="small caution">${escapeHtml(s.district)} reported exactly as many threats as attacks at every one of its schools in ${CRDC_YEAR}, which looks like one figure entered twice. Treat the threat count as unreliable.</p>` : ''}
    <p class="xs muted">Federal Civil Rights Data Collection, ${CRDC_YEAR} (released August 2026), with the ${CRDC_PREV_YEAR} count underneath for comparison. Schools count and code incidents differently, and a change can reflect new staff or reporting practices as much as student behavior; a high count can mean careful reporting. Arrests and referrals count students, not incidents.</p>`;
}

/** Counselors, psychologists and other support staff, with students per person. */
function staffSection(s) {
  const st = s.crdc?.staff;
  if (!st) return '';
  const rows = STAFF_ROLES.map(([role, label]) => {
    const fte = st[role];
    const per = perStaff(s, role);
    const guide = STAFF_GUIDES[role];
    let note = typeof per === 'number' ? `1 per ${per.toLocaleString()} students` : '';
    if (guide && typeof per === 'number') note += per > guide.per ? ` (recommended: 1 per ${guide.per})` : ` (meets the 1 per ${guide.per} guideline)`;
    return `<div class="kv"><div class="k">${label}${role === 'counselors' ? info('staff:counselors') : role === 'police' ? info('staff:police') : ''}</div><div class="v num">${fte == null ? '<span class="sup">—</span>' : fte === 0 ? 'None' : round1(fte)}</div><div class="c">${note}</div></div>`;
  }).join('');
  return `<h3 class="subsec">Support staff on site${info('staff:fte')}</h3><div class="kgrid">${rows}</div>
    <p class="xs muted">Full-time equivalents from the ${CRDC_YEAR} federal collection, divided into this year's enrollment. Staff shared between schools appear as fractions.</p>`;
}

/** Teacher experience and spending per student. */
function resourcesSection(s, d) {
  const m = (key) => measure(s, d, key, { showEmpty: true });
  return `<div class="kgrid">${m('teachers_new_pct')}${m('per_pupil_spending')}</div>
    <p class="xs muted">Teacher experience and spending are OSPI ${store.sources.teachers || ''} figures. Spending includes all funds; schools serving many students with disabilities or English learners receive more by design, and tiny programs show very high per-student amounts.</p>`;
}

/** Department of Health lead-in-water testing. */
function leadSection(s) {
  const l = s.lead;
  if (!l) {
    return `<p class="small">No Department of Health test since 2022 is posted for this school. Schools built before 2016 must test every outlet used for drinking or cooking, either through the Department or on their own, so ask the district for its results. <a href="${LEAD_URL}" rel="noopener">Department of Health results</a></p>`;
  }
  const status = l.over5 === 0
    ? 'Every outlet tested at or below 5 parts per billion (ppb), the level that requires action in Washington.'
    : `${l.over5} of ${l.tested} outlets tested above 5 ppb${l.over15 ? `, ${l.over15} of them above 15 ppb, which must be shut off until fixed` : ''}.${l.retests ? ` ${l.retests} were retested after repairs; ${l.retests_over5 ? `${l.retests_over5} were still above 5 ppb` : 'all came back at or below 5 ppb'}.` : ' No retests after repairs are posted yet.'}`;
  return `<p class="small">Department of Health sampled ${l.tested} drinking-water outlets (latest sample ${l.last}). ${status}${info('lead')} <a href="${LEAD_URL}" rel="noopener">See every outlet</a></p>`;
}

/** Year-by-year charts for this school against same-level schools here. */
function drawTrends(s) {
  for (const [key, label, yTitle, yMax] of TREND_SERIES) {
    const el = document.getElementById(`trend-${key}`);
    if (!el) continue;
    trendChart(el, store.trendYears, [
      { name: 'This school', values: s.trend[key], color: '--hl', strong: true },
      { name: `${s.level === 'Mixed' ? 'All' : s.level} schools here (median)`, values: peerSeries(s, key), color: '--ink-3', dashed: true },
    ], { yTitle, yMax, labelEnds: false, height: 200 });
  }
}

export function renderSchool(code) {
  const s = store.byCode[code];
  const d = districtFor(s);
  const el = $('#v-school');
  const notes = interpretSchool(s, store.state);
  const near = nearbySchools(s);
  const m = (key, opts) => measure(s, d, key, opts);
  const caution = smallSchoolCaution(s);
  const hasTrend = s.trend && TREND_SERIES.some(([k]) => s.trend[k].some((v) => v != null));

  el.innerHTML = `<div class="wrap">
  <div class="phead">
    <div class="crumbs"><a href="#find">Find schools</a> / ${s.area}</div>
    <h1>${escapeHtml(s.name)}</h1>
    <div class="meta">${escapeHtml(districtLabel(s))}, grades ${s.grades}, ${s.enrollment.toLocaleString()} students${s.address ? `. ${escapeHtml(s.address)}, ${s.zip}` : '. No street address on file (district-wide or online program)'}${tagList(s)}</div>
    ${caution ? `<div class="caution" role="note"><b>${caution.kind === 'size' ? 'Small school' : 'Numbers swing a lot here'}${info('small_school')}</b> ${caution.text}</div>` : ''}
    <div class="acts">${compareButton(s.code, 'btn ghost sm')}<a class="btn ghost sm" style="text-decoration:none" href="https://washingtonstatereportcard.ospi.k12.wa.us/" rel="noopener">OSPI Report Card</a></div>
  </div>

  <div class="pgrid">
    <div>
      <div class="scorepanel">${scorePanel(s)}</div>
      <p class="xs muted" style="margin:-18px 0 24px">Scores compare this school only with same-level schools in these six areas. <a href="#glossary">What the scores and measures mean</a></p>

      <div class="reading">
        <h2 class="readh">Reading this school</h2>
        <ul>${notes.map((n) => `<li class="${n.tone}">${n.html}</li>`).join('') || '<li>Not enough reported data for an interpretation.</li>'}</ul>
        <p class="xs muted" style="margin:10px 0 0">Generated from the numbers below using fixed rules (see <a href="#method">How it works</a>). It's an interpretation of public data, not an inspection of the school.</p>
      </div>

      <h2 class="sec">Learning</h2>
      <div class="kgrid">
        ${m('ela_proficient', { showEmpty: true })}${m('math_proficient', { showEmpty: true })}${m('science_proficient', { showEmpty: true })}
        ${m('ela_proficient_low_income', { showEmpty: true })}${m('math_proficient_low_income', { showEmpty: true })}
        ${m('growth_ela')}${m('growth_math')}${m('regular_attendance', { showEmpty: true })}
        ${m('grad_rate_4yr')}${m('ninth_grade_on_track')}${m('dual_credit')}
      </div>

      ${hasTrend ? `<h2 class="sec">Changes over time${info('trends')}</h2>
      <p class="small">${changeSummary(s) || 'Not enough reported years to compare with 2018-19.'}</p>
      <div class="trendgrid">${TREND_SERIES.map(([key, label]) => `<div><h3 class="trendh">${label}</h3><div class="chartbox" id="trend-${key}"></div></div>`).join('')}</div>
      <p class="xs muted" style="margin-bottom:28px">No state tests were given in 2019-20 or 2020-21. Hollow dots are privacy ranges plotted at an estimate. Dashed line: the median of same-level schools in these six areas.</p>` : ''}

      <h2 class="sec">Discipline, ${store.sources.discipline || store.schoolYear}${info('discipline_group')}</h2>
      <p class="small muted">Share of each group suspended or expelled at least once.</p>
      <div class="chartbox" id="profileDiscipline" style="margin-bottom:28px"></div>

      <h2 class="sec">Who attends${info('demographics')}</h2>
      <div class="kgrid">
        ${m('pct_low_income', { showEmpty: true })}${m('pct_english_learners', { showEmpty: true })}${m('pct_disability', { showEmpty: true })}
        ${m('pct_highly_capable', { showEmpty: true })}${m('pct_homeless', { showEmpty: true })}${m('students_per_teacher', { showEmpty: true })}
      </div>
      <div id="profileDemographics" style="margin-bottom:28px"></div>

      <h2 class="sec">Safety and support, ${CRDC_YEAR}</h2>
      ${safetySection(s)}
      ${staffSection(s)}

      <h2 class="sec">Teachers and resources</h2>
      ${resourcesSection(s, d)}

      <h2 class="sec">Lead in drinking water${info('lead')}</h2>
      ${leadSection(s)}
    </div>

    <aside class="side">
      <div class="box"><h3>Questions to ask on a tour</h3><ol>${tourQuestions(s).map((q) => `<li>${q}</li>`).join('')}</ol></div>
      ${near.length ? `<div class="box near"><h3>Nearby ${s.level.toLowerCase()} schools</h3><div class="pmap" id="profileMap"></div>
        ${near.map(({ school: x, miles }) => `<a href="#s-${x.code}">${escapeHtml(x.name)}<span>${miles.toFixed(1)} mi${x.scores?.academics != null ? ` · Acad. ${x.scores.academics}` : ''}</span></a>`).join('')}</div>` : ''}
      <div class="box small"><h3>Boundaries</h3>The nearest school isn't always the assigned one. Check the <a href="https://www.greatschools.org/school-district-boundaries-map/">boundary map</a> or the district's school locator.</div>
      <div class="box small"><h3>More about this school</h3><ul class="links">
        ${s.zip ? `<li><a href="https://censusreporter.org/profiles/86000US${s.zip}/" rel="noopener">Neighborhood (ZIP ${s.zip}) on Census Reporter</a>: income, child poverty, languages</li>` : ''}
        ${s.nces_id ? `<li><a href="https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${s.nces_id}" rel="noopener">Federal school record (NCES)</a></li>` : ''}
        <li><a href="https://edopportunity.org/explorer/" rel="noopener">Stanford Educational Opportunity Explorer</a>: test-score growth compared across the country</li>
        <li><a href="https://kingcounty.gov/school-health-profiles" rel="noopener">District student health profile (Healthy Youth Survey)</a></li>
      </ul><p class="xs muted" style="margin:8px 0 0"><a href="${reportUrl(s)}" rel="noopener">Report a mistake on this page</a></p></div>
    </aside>
  </div></div>`;

  wireCompareButtons(el);
  if (hasTrend) drawTrends(s);

  disciplineBars($('#profileDiscipline'), [
    { label: 'All students', raw: s.discipline?.all, value: num(s.discipline?.all) },
    ...PROFILE_GROUP_ORDER.map((key) => {
      const label = DISCIPLINE_GROUPS.find(([k]) => k === key)[1];
      return { label: key === 'disability' ? label : label.replace(' students', ''), raw: s.discipline?.[key], value: num(s.discipline?.[key]) };
    }),
  ]);

  demographicsBar($('#profileDemographics'), DEMOGRAPHICS.map(([key, label]) => ({ label, value: num(s[key]) || 0 })));

  const mapEl = $('#profileMap');
  if (mapEl) {
    const map = createMap('profile', mapEl, () => mapEl.remove());
    if (map) {
      const layer = addSchoolDots(map, near.map((n) => n.school), () => cssVar('--q3'), (x) => `<b>${escapeHtml(x.name)}</b>${milesBetween(s, x).toFixed(1)} mi away`);
      const self = window.L.circleMarker([s.lat, s.lon], { radius: 9, fillColor: cssVar('--hl'), fillOpacity: 1, color: cssVar('--surface'), weight: 2 })
        .bindTooltip(`<b>${escapeHtml(s.name)}</b>`).addTo(map);
      map.fitBounds(layer.getBounds().extend(self.getLatLng()), { padding: [18, 18] });
    }
  }
}
