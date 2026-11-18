// Feeder patterns: which middle and high school an attendance-area school usually leads to,
// and which schools feed into it. Data: content/feeders.json (district feeder tables and
// boundary maps; see its "districts" entry for each source).

import { store } from './data.js';
import { escapeHtml } from './util.js';

const PROGRAM_TYPES = new Set(['A', 'R', 'S', 'I']);

const entry = (code) => store.feeders?.schools?.[code] || null;

/** Link to a school on the site, or its plain name when it's outside the six areas. */
function schoolRef(r) {
  const s = r.code && store.byCode[r.code];
  return s ? `<a href="#s-${s.code}">${escapeHtml(s.name)}</a>` : escapeHtml(r.name || '');
}

const shareLabel = (v) => (v == null || v >= 60 ? 'most of the area' : v >= 40 ? 'about half the area' : 'part of the area');

/** "Hazen Senior High (most of the area), Renton Senior High (part of the area)" */
function refList(list, splitNote) {
  const shares = list.some((r) => r.share != null);
  const items = list.map((r) => {
    let tag = '';
    if (shares && list.length > 1) tag = ` <span class="muted">(${shareLabel(r.share)})</span>`;
    return `${schoolRef(r)}${tag}`;
  });
  const note = list.length > 1 && !shares && splitNote ? ` <span class="muted">${splitNote}</span>` : '';
  return items.join(', ') + note;
}

/** Schools whose `kind` ("middle" or "high") list includes `code`. */
function fedBy(code, kind, level) {
  const all = store.feeders?.schools || {};
  return Object.entries(all)
    .filter(([c, e]) => (e[kind] || []).some((r) => r.code === code) && store.byCode[c]?.level === level)
    .map(([c, e]) => {
      const r = e[kind].find((x) => x.code === code);
      return { code: c, partial: r.share != null && r.share < 60 };
    })
    .sort((a, b) => store.byCode[a.code].name.localeCompare(store.byCode[b.code].name));
}

const fedList = (rows) => rows.map((r) => `${schoolRef(r)}${r.partial ? ' <span class="muted">(part)</span>' : ''}`).join(', ');

/** Side-panel box describing where a school's students come from and go next. */
export function feederBox(s) {
  const f = store.feeders;
  if (!f) return '';
  const src = f.districts?.[s.district];
  const e = entry(s.code);
  const lines = [];
  let body;

  if (s.is_charter || s.isProgram || PROGRAM_TYPES.has(s.school_type) || e?.choice || s.level === 'Preschool') {
    const what = s.is_charter ? 'Charter school' : e?.choice ? 'Choice school' : s.level === 'Preschool' ? 'Preschool program' : 'District program';
    body = `<p>${what}: students apply or are placed rather than assigned by home address, so it has no feeder pattern.</p>`;
  } else if (!src?.as_of) {
    body = `<p>${escapeHtml(s.district.replace(' No. 1', ''))} doesn't publish a feeder list. Look up a home address on the <a href="${src?.url || '#'}" rel="noopener">district's boundary map</a> to see the assigned middle and high school.</p>`;
  } else {
    if (s.level === 'Elementary' || s.level === 'K-8 / 6-12') {
      if (e?.middle?.length) lines.push(['Middle school', refList(e.middle, '(depends on home address)')]);
      if (e?.high?.length) lines.push(['High school', refList(e.high, '(depends on home address)')]);
    }
    if (s.level === 'Middle') {
      const feeders = fedBy(s.code, 'middle', 'Elementary');
      if (feeders.length) lines.push(['Fed by', fedList(feeders)]);
      if (e?.high?.length) lines.push([e.by_address ? 'High school, by home address' : 'Goes on to', refList(e.high, '(depends on home address)')]);
    }
    if (s.level === 'High') {
      const mids = fedBy(s.code, 'high', 'Middle');
      const els = fedBy(s.code, 'high', 'Elementary');
      if (mids.length) lines.push(['Middle schools', fedList(mids)]);
      if (els.length) lines.push(['Elementary schools', fedList(els)]);
    }
    body = lines.length
      ? `<dl class="feeders">${lines.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`
      : '<p>No feeder pattern listed for this school.</p>';
  }

  const showsShares = /of the area\)|\(part\)/.test(body);
  const foot = src?.as_of && lines.length
    ? `<p class="xs muted" style="margin:8px 0 0">From the <a href="${src.url}" rel="noopener">district's ${/table|patterns/.test(src.source) ? 'feeder list' : 'attendance-area maps'}</a>, ${src.as_of}.${showsShares ? ' Splits are by map area, not number of students.' : ''} Transfer and choice students can follow a different path; confirm a home address with the district.</p>`
    : '';
  return `<div class="box small"><h3>Feeder pattern${s.level === 'High' ? ': who comes here' : ''}</h3>${body}${foot}</div>`;
}

/** One plain sentence for the static school pages. */
export function feederSentence(s, byCode, feeders) {
  const e = feeders?.schools?.[s.code];
  if (!e || e.choice) return '';
  const name = (r) => (r.code && byCode[r.code]?.name) || r.name;
  const parts = [];
  if (e.middle?.length) parts.push(`middle school ${e.middle.map(name).join(' or ')}`);
  if (e.high?.length) parts.push(`high school ${e.high.map(name).join(' or ')}`);
  return parts.length ? `Feeds into ${parts.join(', then ')}.` : '';
}
