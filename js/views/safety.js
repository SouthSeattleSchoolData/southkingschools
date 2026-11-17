// Safety & wellbeing page: news timeline, federal incident counts, restraint and seclusion,
// support staff, lead testing, Healthy Youth Survey, district risk, policies and a public-records request.

import { store, AREAS } from '../data.js';
import { num, escapeHtml, round1, $ } from '../util.js';
import { INCIDENTS, incident } from '../metrics.js';
import { info } from '../glossary.js';

let rendered = false;

export function renderSafety() {
  if (rendered) return; // content doesn't change between visits
  rendered = true;
  renderNews();
  renderIncidents();
  renderRestraint();
  renderStaff();
  renderLead();
  renderSurvey();
  renderRisk();
  renderPolicies();
  renderRecordsRequest();
}

function renderNews() {
  $('#newsList').innerHTML = store.news
    .map((n) => `<li><div class="d">${n.date}, ${n.area}</div><div class="small">${escapeHtml(n.text)} <a href="${n.url}" rel="noopener">${n.source}</a></div></li>`)
    .join('');
}

function seriousCount(s) {
  return ['firearm_possession', 'attacks_with_weapon', 'robbery'].reduce((t, k) => t + (num(incident(s, k)) || 0), 0);
}

function threatRate(s) {
  return ((num(incident(s, 'threats')) || 0) + (num(incident(s, 'attacks')) || 0)) / s.enrollment;
}

function renderIncidents() {
  const reported = store.schools.filter((s) => s.crdc);
  const top = [...reported].sort((a, b) => seriousCount(b) - seriousCount(a) || threatRate(b) - threatRate(a)).slice(0, 25);
  const cols = INCIDENTS.filter(([k]) => k !== 'police_referrals');

  $('#crdcTbl').innerHTML = `<thead><tr><th>School</th>${cols.map(([k, , short]) => `<th>${short}${info(`incident:${k}`)}</th>`).join('')}</tr></thead><tbody>`
    + top.map((s) => `<tr><td><a href="#s-${s.code}">${escapeHtml(s.name)}</a><div class="xs muted">${s.area}</div></td>${cols
      .map(([k]) => { const v = incident(s, k); return `<td>${num(v) > 0 ? `<b>${v}</b>` : '<span class="sup">0</span>'}</td>`; })
      .join('')}</tr>`).join('')
    + '</tbody>';

  const total = (k) => reported.reduce((t, s) => t + (num(incident(s, k)) || 0), 0);
  $('#crdcSum').textContent = `The 25 schools with the most serious reports are shown. Across all ${reported.length} schools with records: ${total('firearm_possession')} firearm possession incidents, ${total('attacks_with_weapon')} attacks with a weapon, ${total('threats')} threats, ${total('sexual_assault')} rapes or sexual assaults, ${total('harassment_allegations')} bullying or harassment allegations and ${total('arrests')} students arrested. Every school's counts are on its own page.`;
}

function renderRestraint() {
  const uses = (s) => ['restraint_physical', 'restraint_mechanical', 'seclusion'].reduce((t, k) => t + (s.crdc?.[k] || 0), 0);
  const withUse = store.schools.filter((s) => uses(s) > 0).sort((a, b) => uses(b) - uses(a));
  const top = withUse.slice(0, 15);
  $('#restraintTbl').innerHTML = `<thead><tr><th>School</th><th>Students</th><th>Physical restraint${info('restraint')}</th><th>Seclusion</th><th>Per 100 students</th></tr></thead><tbody>`
    + top.map((s) => `<tr><td><a href="#s-${s.code}">${escapeHtml(s.name)}</a><div class="xs muted">${s.area}</div></td><td class="num">${s.enrollment.toLocaleString()}</td><td class="num">${s.crdc.restraint_physical ?? '—'}</td><td class="num">${s.crdc.seclusion ?? '—'}</td><td class="num">${round1((100 * uses(s)) / s.enrollment)}</td></tr>`).join('')
    + '</tbody>';
  const total = store.schools.reduce((t, s) => t + uses(s), 0);
  $('#restraintSum').textContent = `${withUse.length} of ${store.schools.filter((s) => s.crdc).length} schools reported at least one use, ${total.toLocaleString()} in all. Several of the highest counts are at programs that serve students with significant disabilities, where a few students can account for most uses.`;
}

function renderStaff() {
  const roles = [['counselors', 'Counselor', 250], ['psychologists', 'Psychologist', 500], ['social_workers', 'Social worker', 250], ['nurses', 'Nurse', null]];
  const rows = AREAS.map((area) => {
    const list = store.schools.filter((s) => s.area === area && s.crdc?.staff && !s.isProgram);
    const enroll = list.reduce((t, s) => t + s.enrollment, 0);
    const per = roles.map(([role]) => {
      const fte = list.reduce((t, s) => t + (s.crdc.staff[role] || 0), 0);
      return fte ? Math.round(enroll / fte) : null;
    });
    const police = list.filter((s) => (s.crdc.staff.police || 0) > 0).length;
    const noCounselor = list.filter((s) => s.crdc.staff.counselors === 0).length;
    return { area, per, police, noCounselor, n: list.length };
  });
  $('#staffTbl').innerHTML = `<thead><tr><th>Area</th>${roles.map(([, label]) => `<th>Students per ${label.toLowerCase()}</th>`).join('')}<th>Schools with no counselor</th><th>Schools with a police officer${info('staff:police')}</th></tr></thead><tbody>`
    + rows.map((r) => `<tr><td>${r.area}</td>${r.per.map((v, i) => {
      const guide = roles[i][2];
      return `<td class="num">${v == null ? '<span class="sup">none reported</span>' : guide && v > guide ? `<b>${v.toLocaleString()}</b>` : v.toLocaleString()}</td>`;
    }).join('')}<td class="num">${r.noCounselor} of ${r.n}</td><td class="num">${r.police}</td></tr>`).join('')
    + '</tbody>';
}

function renderLead() {
  const tested = store.schools.filter((s) => s.lead).sort((a, b) => b.lead.over5 - a.lead.over5 || a.name.localeCompare(b.name));
  $('#leadTbl').innerHTML = `<thead><tr><th>School</th><th>Outlets tested</th><th>Above 5 ppb${info('lead')}</th><th>Above 15 ppb</th><th>Still above 5 ppb after repair</th><th>Latest sample</th></tr></thead><tbody>`
    + tested.map((s) => {
      const l = s.lead;
      return `<tr><td><a href="#s-${s.code}">${escapeHtml(s.name)}</a><div class="xs muted">${s.area}</div></td><td class="num">${l.tested}</td><td class="num">${l.over5 ? `<b>${l.over5}</b>` : 0}</td><td class="num">${l.over15}</td><td class="num">${l.retests ? `${l.retests_over5} of ${l.retests} retested` : l.over5 ? 'no retest posted' : '—'}</td><td>${l.last}</td></tr>`;
    }).join('')
    + '</tbody>';
}

function renderRisk() {
  const c = store.meta.district_context;
  if (!c) return;
  const tone = (v) => ({ 'Very Low': 'r1', Low: 'r2', Average: 'r3', High: 'r4', 'Very High': 'r5' }[v] || '');
  $('#riskTbl').innerHTML = `<thead><tr><th>District or area</th><th>Children in poverty, ${c.saipe_year}${info('child_poverty')}</th>${c.risk_columns.map((col, i) => `<th title="${escapeHtml(c.risk_help[i])}">${col}</th>`).join('')}</tr></thead><tbody>`
    + c.rows.map((r) => `<tr><td>${escapeHtml(r.district)}<div class="xs muted">${r.area}</div></td><td class="num">${r.child_poverty == null ? '—' : `${r.child_poverty}%`}${r.poverty_scope ? `<div class="xs muted">${escapeHtml(r.poverty_scope)}</div>` : ''}</td>${r.risk.map((v) => `<td><span class="risk ${tone(v)}" data-no-t>${v}</span></td>`).join('')}</tr>`).join('')
    + '</tbody>';
  $('#riskNote').innerHTML = `Ratings compare each district with all Washington districts: Very Low is the bottom 10%, High the top 25%. ${escapeHtml(c.seattle_note)} Sources: <a href="${c.links.dshs}" rel="noopener">DSHS Community Risk Profiles</a> (${c.risk_year}); U.S. Census Small Area Income and Poverty Estimates via the Urban Institute.`;
}

function renderSurvey() {
  const h = store.meta.healthy_youth_survey;
  $('#hysTbl').innerHTML = `<thead><tr><th>% of students</th>${h.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`
    + h.rows.map((r) => `<tr><td>${r.label}</td>${r.values.map((v) => `<td>${v || '<span class="sup">—</span>'}</td>`).join('')}</tr>`).join('')
    + '</tbody>';
}

function renderPolicies() {
  $('#polList').innerHTML = store.policies.map((p) => {
    const links = p.links.length ? ' ' + p.links.map(([label, url]) => `<a href="${url}" rel="noopener">${label}</a>`).join(', ') + '.' : '';
    return `<div><h3 style="font-size:17px;margin-bottom:4px">${p.name}</h3><p class="small" style="color:var(--ink-2)">${p.text}${links}</p></div>`;
  }).join('');
}

const RECORDS_REQUEST = `To: Public Records Officer, [District name]
Re: Public records request under RCW 42.56

Please provide the following records for school years 2022-23 through 2025-26, by school, in electronic format (a spreadsheet is ideal):

1. The number of incidents involving firearms, other weapons or explosive devices on school property or at school events, by weapon type (the data the district reports to OSPI for the Weapons in Schools report).
2. The number of bomb threats and threats of violence received, and the number of lockdowns, shelter-in-place events, evacuations and closures, with dates and the school affected.
3. The number of behavioral threat assessments opened under RCW 28A.320.123, by level of concern (no names or student identifiers).
4. The number of harassment, intimidation and bullying (HIB) complaints received under Policy 3207, and how many were substantiated.
5. The district's current HIB, weapons, threat-assessment and safety-staffing policies, and any agreement with a law enforcement agency for school resource or engagement officers.
6. The district's 2025 Healthy Youth Survey district report (aggregate results only), if the district will release it.

I'm not requesting any personally identifiable student information. Aggregate counts with small-number suppression are fine.

Thank you,
[Name, email]`;

function renderRecordsRequest() {
  const box = $('#prr');
  box.value = RECORDS_REQUEST;
  $('#copyPrr').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(box.value);
      $('#copyMsg').textContent = 'Copied.';
    } catch {
      box.focus();
      box.select();
      $('#copyMsg').textContent = 'Copy was blocked. The text is selected, so press Ctrl+C or Cmd+C.';
    }
  });
}
