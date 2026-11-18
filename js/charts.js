// Small SVG charts. Colors come from CSS variables so light/dark themes just work.
// Every chart labels both axes: a title along each axis plus tick values on the measured axis.

import { escapeHtml, plain, round1, num, showTip, hideTip } from './util.js';

const chartWidth = (el, max = 640) => Math.max(260, Math.min((el.clientWidth || 560) - 32, max));

let measureCtx;
/** Width in px of chart text, measured with the page's own font (estimated if canvas is unavailable). */
function textWidth(text, size = 12, weight = 400) {
  try {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} ${size}px "Public Sans", sans-serif`;
    return measureCtx.measureText(String(text)).width;
  } catch {
    return String(text).length * size * 0.55;
  }
}

/** Splits an axis title into one or two lines so it fits `maxW` pixels. */
function titleLines(text, maxW, size = 12, weight = 600) {
  if (textWidth(text, size, weight) <= maxW) return [text];
  const words = text.split(' ');
  let best = [text];
  let bestW = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const w = Math.max(textWidth(a, size, weight), textWidth(b, size, weight));
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  return best;
}

/** Round, readable tick values from 0 up to at least `max`. */
function niceTicks(max, target = 4) {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(6)));
  return ticks;
}

const tickLabel = (v, unit) => `${Number.isInteger(v) ? v : Math.round(v * 100) / 100}${unit}`;

/** Bottom axis for horizontal bar charts: baseline, gridlines, tick labels, axis title. */
function bottomAxis({ x, ticks, unit, top, bottom, left, right, title, W }) {
  let svg = '';
  for (const t of ticks) {
    const label = tickLabel(t, unit);
    const half = textWidth(label) / 2;
    const anchor = x(t) - half < 0 ? 'start' : W && x(t) + half > W ? 'end' : 'middle';
    const tx = anchor === 'start' ? 0 : anchor === 'end' ? W : x(t);
    svg += `<line class="gl" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${bottom}"/>`;
    svg += `<text x="${tx}" y="${bottom + 15}" text-anchor="${anchor}" class="num">${label}</text>`;
  }
  svg += `<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="var(--line-2)"/>`;
  const lines = titleLines(title, (W || right) - 4);
  const widest = Math.max(...lines.map((l) => textWidth(l, 12, 600)));
  const cx = Math.min(Math.max((left + right) / 2, widest / 2 + 2), (W || right) - widest / 2 - 2);
  lines.forEach((l, i) => {
    svg += `<text class="axis-title" x="${cx}" y="${bottom + 34 + i * 15}" text-anchor="middle">${escapeHtml(l)}</text>`;
  });
  return svg;
}

/** Extra height a bottom axis needs when its title wraps to two lines. */
const axisExtra = (title, W) => (titleLines(title, W - 4).length - 1) * 15;

/** Title above the category labels of a horizontal bar chart (the y axis). */
const yHeader = (x, text) => `<text class="axis-title" x="${x}" y="12" text-anchor="end">${escapeHtml(text)}</text>`;

/**
 * Paired horizontal bars: grey = all students, blue = a group, with the ratio.
 * rows: [{ label, all, group, allText?, groupText? }]
 */
export function pairedBars(el, rows, groupLabel, { xTitle = 'Share of students suspended or expelled (%)', yTitle = 'District' } = {}) {
  const W = chartWidth(el);
  const rowH = 46;
  const left = 84;
  const right = W - 70;
  const top = 22;
  const plotBottom = top + rows.length * rowH;
  const H = plotBottom + 44 + axisExtra(xTitle, W);
  const ticks = niceTicks(Math.max(...rows.map((r) => Math.max(r.all || 0, r.group || 0))));
  const max = ticks[ticks.length - 1];
  const x = (v) => left + ((right - left) * (v || 0)) / max;

  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="${escapeHtml(groupLabel)} compared with all students, by ${escapeHtml(yTitle.toLowerCase())}">`;
  svg += bottomAxis({ x, ticks, unit: '%', top, bottom: plotBottom, left, right, title: xTitle, W });
  svg += yHeader(left - 8, yTitle);
  rows.forEach((r, i) => {
    const y = top + i * rowH + 4;
    const ratio = r.all && r.group && !r.allText ? `<tspan dx="8" style="font-weight:400;fill:var(--ink-2)">${(r.group / r.all).toFixed(1)}×</tspan>` : '';
    svg += `<text x="${left - 8}" y="${y + 21}" text-anchor="end" style="fill:var(--ink)">${escapeHtml(r.label)}</text>`;
    svg += `<rect x="${left}" y="${y + 4}" width="${Math.max(2, x(r.all) - left)}" height="13" rx="4" fill="var(--mute)"/>`;
    svg += `<text x="${x(r.all) + 5}" y="${y + 15}" class="num">${escapeHtml(r.allText ?? (r.all != null ? r.all.toFixed(2) + '%' : '—'))}</text>`;
    svg += `<rect x="${left}" y="${y + 20}" width="${Math.max(2, x(r.group) - left)}" height="13" rx="4" fill="var(--d1)"/>`;
    svg += `<text x="${x(r.group) + 5}" y="${y + 31}" class="num" style="fill:var(--ink);font-weight:600">${escapeHtml(r.groupText ?? (r.group != null ? r.group.toFixed(2) + '%' : '—'))}${ratio}</text>`;
  });
  el.innerHTML = `${svg}</svg><div class="legend"><span><i style="background:var(--mute)"></i>All students</span><span><i style="background:var(--d1)"></i>${escapeHtml(groupLabel)}</span><span>2.1× = 2.1 times the all-students rate</span></div>`;
}

/**
 * Scatter of schools: x = low-income share, y = a measure, dashed trend line.
 * points: [{ s, x, y, res }]; trend: { a, b }. Highlighted area draws in orange on top.
 */
export function incomeScatter(el, points, trend, { label, unit = '', yTitle, highlight = 'None', height, pad = 32 }) {
  const W = Math.max(280, (el.clientWidth || 600) - pad);
  const H = height || Math.min(420, Math.max(280, W * 0.58));
  const [pl, pr, pt, pb] = [56, 20, 12, 48];
  const ticks = niceTicks(Math.max(...points.map((p) => p.y)), 4);
  const maxY = ticks[ticks.length - 1];
  const X = (v) => pl + ((W - pl - pr) * v) / 100;
  const Y = (v) => H - pb - ((H - pt - pb) * v) / maxY;
  const yAxisTitle = yTitle || `${label}${unit ? ` (${unit})` : ''}`;

  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="Schools by low-income share and ${escapeHtml(label)}">`;
  for (const v of ticks) {
    svg += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end" class="num">${tickLabel(v, '')}</text>`;
  }
  for (let v = 0; v <= 100; v += 25) svg += `<text x="${X(v)}" y="${H - pb + 16}" text-anchor="middle" class="num">${v}%</text>`;
  svg += `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line-2)"/>`;
  svg += `<text class="axis-title" x="${(W + pl) / 2}" y="${H - 8}" text-anchor="middle">Low-income students (% of enrollment)</text>`;
  svg += `<text class="axis-title" transform="translate(14 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(yAxisTitle)}</text>`;
  svg += `<line x1="${X(0)}" y1="${Y(Math.max(0, trend.a))}" x2="${X(100)}" y2="${Y(Math.max(0, trend.a + trend.b * 100))}" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="6 4"/>`;

  const ordered = [...points].sort((a, b) => (a.s.area === highlight) - (b.s.area === highlight));
  for (const p of ordered) {
    const on = p.s.area === highlight;
    const opacity = highlight === 'None' ? 0.7 : on ? 0.95 : 0.25;
    svg += `<circle data-code="${p.s.code}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${on ? 6 : 4.6}" fill="var(${on ? '--hl' : '--d1'})" fill-opacity="${opacity}" stroke="var(--surface)" stroke-width="1.5" style="cursor:pointer"/>`;
  }
  el.innerHTML = svg + '</svg>';

  el.querySelectorAll('circle[data-code]').forEach((c) => {
    const p = points.find((q) => q.s.code === c.dataset.code);
    const html = `<b>${escapeHtml(p.s.name)}</b>${p.s.area}<br>${p.x}% low-income<br>${escapeHtml(label)}: ${p.y.toFixed(1)}${unit} (${p.res >= 0 ? '+' : ''}${p.res.toFixed(1)} vs trend)`;
    c.addEventListener('mousemove', (e) => showTip(html, e));
    c.addEventListener('mouseleave', hideTip);
    c.addEventListener('click', () => { location.hash = `s-${p.s.code}`; });
  });
}

/**
 * Horizontal bars for one school's discipline rates by group.
 * Suppressed values ("<8.3") draw as outlined bars up to the bound.
 * groups: [{ label, raw, value }]
 */
export function disciplineBars(el, groups) {
  const W = chartWidth(el);
  const rowH = 26;
  const maxLabel = W * 0.45;
  const fits = groups.every((g) => textWidth(g.label, 12) + 14 <= maxLabel);
  const labelOf = (g) => (fits ? g.label : g.short || g.label);
  const left = Math.min(maxLabel, Math.max(...groups.map((g) => textWidth(labelOf(g), 12))) + 14);
  const right = W - 60;
  const top = 22;
  const plotBottom = top + groups.length * rowH + 4;
  const xTitle = 'Share of the group suspended or expelled (%)';
  const H = plotBottom + 44 + axisExtra(xTitle, W);
  const bound = (g) => (typeof g.raw === 'string' && g.raw[0] === '<' ? parseFloat(g.raw.slice(1)) : g.value);
  const ticks = niceTicks(Math.max(1, ...groups.map(bound).filter((v) => v != null)));
  const max = ticks[ticks.length - 1];
  const X = (v) => left + ((right - left) * v) / max;

  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="Suspension rates by student group">`;
  svg += bottomAxis({ x: X, ticks, unit: '%', top, bottom: plotBottom, left, right, title: xTitle, W });
  svg += `<text class="axis-title" x="0" y="12">Student group</text>`;
  groups.forEach((g, i) => {
    const y = top + i * rowH + 3;
    svg += `<text x="${left - 8}" y="${y + 14}" text-anchor="end" style="fill:${i ? 'var(--ink-2)' : 'var(--ink)'}">${escapeHtml(labelOf(g))}</text>`;
    if (g.value == null) {
      const why = typeof g.raw === 'string' && /^n</i.test(g.raw) ? 'fewer than 10 students' : '—';
      svg += `<text x="${left + 4}" y="${y + 14}" style="fill:var(--ink-3)">${why}</text>`;
      return;
    }
    const suppressed = typeof g.raw === 'string';
    const end = X(bound(g));
    const fill = i ? 'var(--d1)' : 'var(--mute)';
    const style = suppressed ? 'fill-opacity=".25" stroke="var(--d1)" stroke-dasharray="3 2"' : '';
    svg += `<rect x="${left}" y="${y + 4}" width="${Math.max(2, end - left)}" height="13" rx="4" fill="${fill}" ${style}/>`;
    svg += `<text x="${end + 5}" y="${y + 15}" class="num" style="fill:var(--ink)">${escapeHtml(plain(g.raw, '%'))}</text>`;
  });
  el.innerHTML = `${svg}</svg><div class="legend"><span><i style="background:var(--d1);opacity:.3;border:1px dashed var(--d1)"></i>Outlined bars are privacy-suppressed: the true rate is somewhere below the value shown</span></div>`;
}

/** Expected-vs-actual bars for "beat the odds" schools. rows: [{ name, lowIncome, expected, actual }] */
export function expectedVsActual(el, rows) {
  const W = chartWidth(el, 620);
  const rowH = 80;
  const left = 0;
  const right = W - 90;
  const top = 6;
  const plotBottom = top + rows.length * rowH;
  const xTitle = 'Students meeting standard, reading + math average (%)';
  const H = plotBottom + 44 + axisExtra(xTitle, W);
  const ticks = [0, 25, 50, 75, 100];
  const X = (v) => left + ((right - left) * v) / 100;

  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="Expected and actual results">`;
  svg += bottomAxis({ x: X, ticks, unit: '%', top, bottom: plotBottom, left, right, title: xTitle, W });
  rows.forEach((r, i) => {
    const y = top + i * rowH + 6;
    svg += `<text x="0" y="${y + 12}" style="fill:var(--ink);font-weight:600">${escapeHtml(r.name)}</text><text x="${W}" y="${y + 12}" text-anchor="end">${r.lowIncome}% low-income</text>`;
    svg += `<rect x="${left}" y="${y + 20}" width="${X(r.expected)}" height="10" rx="4" fill="var(--mute)"/><text x="${X(r.expected) + 6}" y="${y + 29}" class="num">${r.expected.toFixed(0)}% expected</text>`;
    svg += `<rect x="${left}" y="${y + 34}" width="${X(r.actual)}" height="10" rx="4" fill="var(--d1)"/><text x="${X(r.actual) + 6}" y="${y + 43}" class="num" style="fill:var(--ink);font-weight:600">${r.actual.toFixed(0)}% actual</text>`;
  });
  el.innerHTML = `${svg}</svg><div class="legend"><span><i style="background:var(--mute)"></i>Expected from low-income share</span><span><i style="background:var(--d1)"></i>Actual</span></div>`;
}

/** Stacked bar of race/ethnicity shares, single-hue so text labels carry identity. */
export function demographicsBar(el, parts) {
  const shades = ['--q5', '--q4', '--q3', '--q2', '--q1', '--mute'];
  const shown = parts.map((p, i) => ({ ...p, shade: shades[i] })).filter((p) => p.value > 0);
  el.innerHTML =
    `<div style="display:flex;height:16px;border-radius:5px;overflow:hidden" role="img" aria-label="Students by race and ethnicity">${shown
      .map((p) => `<div title="${p.label} ${p.value}%" style="flex:${p.value} 0 0;background:var(${p.shade});border-right:2px solid var(--paper)"></div>`)
      .join('')}</div>` +
    `<div class="legend">${shown.map((p) => `<span><i style="background:var(${p.shade})"></i>${p.label} ${round1(p.value)}%</span>`).join('')}</div>`;
}

/**
 * Line chart across school years. Years with no tests (2019-20, 2020-21) are shown as a gap
 * bridged by a dotted line. Privacy ranges ("<1", ">90") plot at their estimate as hollow dots.
 * series: [{ name, values, color: '--c1', dashed?, strong? }]
 */
export function trendChart(el, years, series, { unit = '%', yTitle, yMax, height = 210, labelEnds = true, maxWidth = 620 } = {}) {
  const W = chartWidth(el, maxWidth);
  const H = height;
  const [pl, pr, pt, pb] = [46, labelEnds ? 92 : 26, 12, 46];
  const value = (v) => (v == null ? null : typeof v === 'number' ? v : num(v));
  const all = series.flatMap((s) => s.values.map(value)).filter((v) => v != null);
  const ticks = niceTicks(yMax ?? Math.max(1, ...all), 4);
  const top = ticks[ticks.length - 1];
  // x slots: a wider step across the pandemic gap
  const gapAfter = years.findIndex((y, i) => i > 0 && Number(y.slice(0, 4)) - Number(years[i - 1].slice(0, 4)) > 1);
  const slots = years.map((_, i) => i + (gapAfter > 0 && i >= gapAfter ? 0.8 : 0));
  const lastSlot = slots[slots.length - 1] || 1;
  const X = (i) => pl + ((W - pl - pr) * slots[i]) / lastSlot;
  const Y = (v) => H - pb - ((H - pt - pb) * v) / top;

  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="${escapeHtml(yTitle || '')} by school year">`;
  for (const t of ticks) svg += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end" class="num">${tickLabel(t, '')}</text>`;
  // year labels: keep the first and last, drop any that would collide with a kept neighbour
  const yearText = years.map((y) => y.replace(/^20(\d\d)-(\d\d)$/, '’$1–’$2'));
  const half = Math.max(...yearText.map((t) => textWidth(t))) / 2 + 3;
  const keep = new Set([0, years.length - 1]);
  let lastX = X(0);
  for (let i = 1; i < years.length - 1; i++) {
    if (X(i) - lastX >= half * 2 && X(years.length - 1) - X(i) >= half * 2) { keep.add(i); lastX = X(i); }
  }
  years.forEach((y, i) => {
    svg += `<line x1="${X(i)}" x2="${X(i)}" y1="${H - pb}" y2="${H - pb + 4}" stroke="var(--line-2)"/>`;
    if (keep.has(i)) svg += `<text x="${X(i)}" y="${H - pb + 16}" text-anchor="middle" class="num">${yearText[i]}</text>`;
  });
  if (gapAfter > 0) {
    const gx = (X(gapAfter - 1) + X(gapAfter)) / 2;
    svg += `<text x="${gx}" y="${pt + 10}" text-anchor="middle" class="xs gaplbl">no tests</text>`;
  }
  svg += `<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line-2)"/>`;
  svg += `<text class="axis-title" x="${(pl + W - pr) / 2}" y="${H - 8}" text-anchor="middle">School year</text>`;
  const plotH = H - pt - pb;
  const yFont = Math.max(10, Math.min(12, (12 * (plotH - 6)) / Math.max(1, textWidth(yTitle || '', 12, 600))));
  svg += `<text class="axis-title" transform="translate(13 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle" style="font-size:${yFont.toFixed(1)}px">${escapeHtml(yTitle || '')}</text>`;

  const ends = [];
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => ({ i, v: value(v), raw: v })).filter((p) => p.v != null);
    const w = s.strong ? 2.6 : 1.8;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const bridged = gapAfter > 0 && a.i < gapAfter && b.i >= gapAfter;
      const dash = s.dashed ? '5 4' : bridged ? '2 4' : '';
      svg += `<line x1="${X(a.i)}" y1="${Y(a.v)}" x2="${X(b.i)}" y2="${Y(b.v)}" stroke="var(${s.color})" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    }
    for (const p of pts) {
      const hollow = typeof p.raw === 'string';
      svg += `<circle data-s="${si}" data-i="${p.i}" cx="${X(p.i)}" cy="${Y(p.v)}" r="${s.strong ? 4 : 3}" fill="${hollow ? 'var(--surface)' : `var(${s.color})`}" stroke="var(${hollow ? s.color : '--surface'})" stroke-width="${hollow ? 1.6 : 1.2}"/>`;
      svg += `<circle data-s="${si}" data-i="${p.i}" cx="${X(p.i)}" cy="${Y(p.v)}" r="11" fill="transparent" class="hit"/>`;
    }
    const last = pts[pts.length - 1];
    if (last && labelEnds) ends.push({ y: Y(last.v), x: X(last.i), name: s.name, color: s.color });
  });
  // direct labels at line ends, nudged apart so they don't overlap
  ends.sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
  for (const e of ends) svg += `<text x="${e.x + 8}" y="${e.y + 4}" class="endlbl">${escapeHtml(e.name)}</text>`;
  el.innerHTML = svg + '</svg>'
    + (series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:var(${s.color})${s.dashed ? ';opacity:.6' : ''}"></i>${escapeHtml(s.name)}</span>`).join('')}</div>` : '');

  el.querySelectorAll('circle.hit').forEach((c) => {
    const s = series[+c.dataset.s];
    const i = +c.dataset.i;
    const raw = s.values[i];
    const html = `<b>${escapeHtml(s.name)}</b>${years[i]}: ${escapeHtml(plain(raw, unit))}${typeof raw === 'string' ? ' (privacy range)' : ''}`;
    c.addEventListener('mousemove', (e) => showTip(html, e));
    c.addEventListener('mouseleave', hideTip);
  });
}
