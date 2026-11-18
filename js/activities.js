// Sports and competitions: WIAA state results, academic competitions and sports offered
// (content/activities.json, built by tools/snapshot/build-activities.py).

import { store } from './data.js';
import { escapeHtml, num, $, $$, bindTips } from './util.js';
import { info } from './glossary.js';

const ORDINAL = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const SHOWN = 8;

export function activityRecord(code) {
  return store.activities?.schools?.[code] || null;
}

function placeText(r) {
  if (r.kind === 'sport' || r.event === 'Knowledge Bowl') return r.place === 1 ? 'State champion' : 'Runner-up';
  if (r.of) return r.place === 1 ? 'State champion' : `${ORDINAL(r.place)} of ${r.of} teams`;
  return r.place === 1 ? 'State champion' : `${ORDINAL(r.place)} place`;
}

function resultItem(r) {
  const top = r.place === 1;
  return `<li class="${top ? 'win' : ''}"><span class="ry">${r.year}</span><span class="re">${escapeHtml(r.event)}${r.cls ? ` <span class="muted">(${r.cls})</span>` : ''}</span><span class="rp">${placeText(r)}</span></li>`;
}

function sportsList(rec) {
  const order = ['Boys', 'Girls', 'Coed', 'Unified', 'Mixed'];
  return Object.entries(rec.sports || {}).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([who, list]) => `<p class="small" style="margin:4px 0"><b>${who}:</b> ${list.map(escapeHtml).join(', ')}</p>`).join('');
}

/** "Sports and competitions" block for a school page, or '' when it doesn't apply. */
export function activitiesSection(s) {
  const a = store.activities;
  if (!a) return '';
  const rec = activityRecord(s.code);
  const isHigh = /^(9|10|11)/.test(s.grades) || s.level === 'K-8 / 6-12';
  const isMiddle = s.level === 'Middle';
  if (!rec && !isHigh && !isMiddle) return '';
  if (!rec && s.isProgram) return '';

  const results = rec?.results || [];
  const sport = results.filter((r) => r.kind === 'sport');
  const academic = results.filter((r) => r.kind === 'academic');
  const parts = [];

  if (rec?.cls) {
    const sportTitles = sport.filter((r) => r.place === 1).length;
    const runner = sport.filter((r) => r.place === 2).length;
    parts.push(`<p class="small">Competes in WIAA class <b>${rec.cls}</b>${info('wiaa_class')}${rec.league ? `, ${escapeHtml(rec.league)} league` : ''}${rec.mascot ? ` (the ${escapeHtml(rec.mascot)})` : ''}. ${sport.length
      ? `In the last 10 school years (${a.window}) its teams won <b>${sportTitles} state ${sportTitles === 1 ? 'title' : 'titles'}</b> and ${runner ? `finished second ${runner === 1 ? 'once' : runner === 2 ? 'twice' : `${runner} times`}` : 'had no runner-up finishes'}.${info('state_results')}`
      : `No team finished first or second at a state tournament in the last 10 school years (${a.window}).${info('state_results')}`}</p>`);
  } else if (isMiddle) {
    parts.push('<p class="small">Middle school sports are run by the district and league, with no state tournament.</p>');
  } else if (isHigh) {
    parts.push('<p class="small">This school isn\'t listed in the WIAA directory with its own teams. Students at small or alternative high schools often play for their neighborhood school.</p>');
  }

  if (results.length) {
    const list = [...sport, ...academic].sort((x, y) => y.year.localeCompare(x.year) || x.place - y.place);
    const first = list.slice(0, SHOWN).map(resultItem).join('');
    const rest = list.slice(SHOWN).map(resultItem).join('');
    parts.push(`<ul class="results">${first}</ul>${rest ? `<details class="more"><summary>Show all ${list.length} results</summary><ul class="results">${rest}</ul></details>` : ''}`);
  }
  if (academic.length === 0 && (isHigh || isMiddle)) {
    parts.push(`<p class="xs muted">No top finishes found in the statewide academic competitions tracked here (Science Olympiad${isHigh ? ', Knowledge Bowl, chess' : ''}).</p>`);
  }
  if (rec?.sports) {
    parts.push(`<h3 class="trendh" style="margin-top:14px">Sports offered</h3>${sportsList(rec)}
      <p class="xs muted">Sports registered with the WIAA. Clubs and non-WIAA teams (robotics, ultimate, esports, drama) aren't listed yet; check the school's website.</p>`);
  }
  parts.push(`<p class="xs muted">Sources: ${a.sources.map((x) => `<a href="${x.url}" rel="noopener">${escapeHtml(x.name)}</a>`).join(', ')}.</p>`);
  return `<h2 class="sec">Sports and competitions</h2>${parts.join('')}`;
}

/** Values for the Compare page. */
export function activityValue(s, key) {
  const rec = activityRecord(s.code);
  const hs = /^(9|10|11)/.test(s.grades);
  if (!rec) return hs && !s.isProgram ? 0 : null;
  const sport = rec.results.filter((r) => r.kind === 'sport');
  if (key === 'act:titles') return rec.cls ? sport.filter((r) => r.place === 1).length : null;
  if (key === 'act:runner') return rec.cls ? sport.filter((r) => r.place === 2).length : null;
  if (key === 'act:academic') return rec.results.filter((r) => r.kind === 'academic' && r.place <= 3).length;
  if (key === 'act:sports') return rec.sports ? Object.values(rec.sports).reduce((t, l) => t + l.length, 0) : null;
  return null;
}

const fstate = { cls: '' };

/** Findings page: state titles and runner-up finishes per high school. */
export function renderStateResults() {
  const box = $('#wins');
  const a = store.activities;
  if (!box || !a) return;
  const rows = Object.entries(a.schools).filter(([, r]) => r.cls).map(([code, r]) => {
    const s = store.byCode[code];
    const sport = r.results.filter((x) => x.kind === 'sport');
    return { s, cls: r.cls, titles: sport.filter((x) => x.place === 1).length, runner: sport.filter((x) => x.place === 2).length, low: num(s.pct_low_income) };
  }).filter((r) => r.s);

  const CLASS_ORDER = ['4A', '3A', '2A', '1A', '2B', '1B'];
  const classes = [...new Set(rows.map((r) => r.cls))].sort((x, y) => CLASS_ORDER.indexOf(x) - CLASS_ORDER.indexOf(y));
  const chipsEl = $('#winsChips');
  chipsEl.innerHTML = [['', 'All high schools'], ...classes.map((c) => [c, `Now ${c}`])].map(([k, l]) => `<button class="chip${k === fstate.cls ? ' on' : ''}" data-k="${k}" type="button" aria-pressed="${k === fstate.cls}">${l}</button>`).join('');
  $$('.chip', chipsEl).forEach((b) => b.addEventListener('click', () => { fstate.cls = b.dataset.k; renderStateResults(); }));

  const shown = rows.filter((r) => !fstate.cls || r.cls === fstate.cls).sort((x, y) => (y.titles + y.runner) - (x.titles + x.runner) || y.titles - x.titles || x.s.name.localeCompare(y.s.name));
  const max = Math.max(1, ...rows.map((r) => r.titles + r.runner));
  box.innerHTML = `<div class="winbars" role="table" aria-label="State titles and runner-up finishes by school">
    ${shown.map((r) => `<div class="wrow" role="row" data-code="${r.s.code}">
      <a role="cell" class="wname" href="#s-${r.s.code}">${escapeHtml(r.s.name)}<span class="xs muted"> ${r.cls}, ${r.low}% low-income</span></a>
      <div role="cell" class="wbar">${r.titles ? `<i class="t" style="width:${(r.titles / max) * 100}%"></i>` : ''}${r.runner ? `<i class="r" style="width:${(r.runner / max) * 100}%"></i>` : ''}<b>${r.titles + r.runner ? `${r.titles} + ${r.runner}` : 'None'}</b></div>
    </div>`).join('')}</div>`;
  bindTips($$('.wrow', box), (el) => {
    const r = rows.find((x) => x.s.code === el.dataset.code);
    return `<b>${escapeHtml(r.s.name)}</b>${r.titles} state ${r.titles === 1 ? 'title' : 'titles'}, ${r.runner} runner-up, ${a.window}<br>Now ${r.cls}; ${r.low}% low-income`;
  });

  const lowIncome = rows.filter((r) => r.low < 30);
  const higher = rows.filter((r) => r.low >= 30);
  const per = (list) => (list.reduce((t, r) => t + r.titles + r.runner, 0) / Math.max(1, list.length)).toFixed(1);
  $('#winsSum').textContent = `Over ${a.window}, the ${lowIncome.length} high schools where fewer than 30% of students are low-income averaged ${per(lowIncome)} top-two state finishes each; the ${higher.length} schools at 30% or more averaged ${per(higher)}.`;
}
