// Compare page: up to four schools side by side, strongest value per row marked.

import { store } from '../data.js';
import { fmt, escapeHtml, $, $$ } from '../util.js';
import { METRICS, incident } from '../metrics.js';
import { compareCodes, setCompare, toggleCompare } from '../compare-list.js';
import { info, glossaryKey } from '../glossary.js';

// [key, label, better]: better = 'high' | 'low' | null (no "best" marker). A null key starts a group.
const ROWS = [
  [null, 'Scores'],
  ['score:academics', 'Academics', 'high'],
  ['score:growth', 'Growth', 'high'],
  ['score:equity', 'Equity', 'high'],
  ['score:climate', 'Climate', 'high'],
  [null, 'Learning'],
  ['ela_proficient', 'Reading proficiency %', 'high'],
  ['math_proficient', 'Math proficiency %', 'high'],
  ['science_proficient', 'Science proficiency %', 'high'],
  ['ela_proficient_low_income', 'Reading, low-income %', 'high'],
  ['growth_ela', 'Reading growth', 'high'],
  ['growth_math', 'Math growth', 'high'],
  ['regular_attendance', 'Regular attendance %', 'high'],
  ['grad_rate_4yr', '4-year graduation %', 'high'],
  ['ela_change', 'Reading change since 2018-19 (pts)', 'high'],
  ['math_change', 'Math change since 2018-19 (pts)', 'high'],
  [null, 'Discipline'],
  ['discipline_all', 'Suspended or expelled %', 'low'],
  ['discipline_disability', 'Students with disabilities %', 'low'],
  ['discipline_black', 'Black students %', 'low'],
  ['discipline_low_income', 'Low-income students %', 'low'],
  [null, 'Students'],
  ['enrollment', 'Enrollment', null],
  ['pct_low_income', 'Low-income %', null],
  ['pct_english_learners', 'English learners %', null],
  ['pct_disability', 'Students with disabilities %', null],
  ['pct_highly_capable', 'Highly capable %', null],
  ['students_per_teacher', 'Students per teacher', null],
  [null, 'Staff and resources'],
  ['students_per_counselor', 'Students per counselor', 'low'],
  ['students_per_psychologist', 'Students per psychologist', 'low'],
  ['teachers_new_pct', 'Teachers in first 5 years %', null],
  ['per_pupil_spending', 'Spending per student', null],
  [null, 'Incidents, 2021-22'],
  ['incident:threats', 'Threats of attack', 'low'],
  ['incident:attacks', 'Physical attacks or fights', 'low'],
  ['incident:firearm_possession', 'Firearm possession', 'low'],
  ['incident:harassment_allegations', 'Bullying allegations', null],
  ['restraint', 'Restraint and seclusion uses', 'low'],
  ['lead', 'Outlets above 5 ppb lead', 'low'],
];

function valueOf(s, key) {
  if (key === 'restraint') return s.crdc ? ['restraint_physical', 'restraint_mechanical', 'seclusion'].reduce((t, k) => t + (s.crdc[k] || 0), 0) : null;
  if (key === 'lead') return s.lead ? s.lead.over5 : null;
  if (key.startsWith('score:')) return s.scores?.[key.slice(6)] ?? null;
  if (key.startsWith('incident:')) return incident(s, key.slice(9));
  return METRICS[key].get(s);
}

export function renderCompare() {
  const out = $('#cmpOut');
  const schools = compareCodes().map((c) => store.byCode[c]).filter(Boolean);

  if (!schools.length) {
    const example = (store.meta.compare_example || []).filter((c) => store.byCode[c]);
    out.innerHTML = `<div class="empty"><p>No schools added yet. Use "Add to compare" in <a href="#find">Find schools</a> or on any school page.</p>
      ${example.length ? '<button class="btn sm" id="cmpExample" type="button">Try an example: four Renton-area elementary schools</button>' : ''}</div>`;
    $('#cmpExample')?.addEventListener('click', () => { setCompare(example); renderCompare(); });
    return;
  }

  const head = schools.map((s) => `<th>
      <a href="#s-${s.code}" class="rname" style="color:var(--ink);text-decoration:none">${escapeHtml(s.name)}</a>
      <div class="xs muted" style="font-weight:400">${s.area}, ${s.grades}</div>
      <button class="rm" data-remove="${s.code}" type="button">Remove</button></th>`).join('');

  const body = ROWS.map(([key, label, better]) => {
    if (!key) return `<tr class="grp"><td colspan="${schools.length + 1}">${label}</td></tr>`;
    const raw = schools.map((s) => valueOf(s, key));
    const exactValues = raw.map((v) => (typeof v === 'number' ? v : null));
    const candidates = exactValues.filter((v) => v != null);
    let best = null;
    if (better && candidates.length > 1) {
      best = better === 'high' ? Math.max(...candidates) : Math.min(...candidates);
      if (candidates.every((v) => v === best)) best = null;
    }
    const termKey = key.startsWith('score:') || key.startsWith('incident:') || key === 'restraint' || key === 'lead' ? key : glossaryKey(key);
    const unit = METRICS[key]?.unit === '$' ? '$' : '';
    return `<tr><td>${label}${info(termKey)}</td>${raw.map((v, i) => `<td class="${best != null && exactValues[i] === best ? 'best' : ''}">${fmt(v, unit)}</td>`).join('')}</tr>`;
  }).join('');

  out.innerHTML = `<div class="scroll" style="margin-top:16px"><table class="cmp" style="--n:${schools.length}"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="xs muted" style="margin-top:8px">Gray values are privacy-suppressed ranges and aren't marked as best. Remember that raw scores follow family income; the Equity score adjusts for it.</p>`;

  $$('[data-remove]', out).forEach((b) => b.addEventListener('click', () => { toggleCompare(b.dataset.remove); renderCompare(); }));
}

