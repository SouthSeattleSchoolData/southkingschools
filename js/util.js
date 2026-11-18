// Small shared helpers: value parsing, formatting, DOM and tooltip utilities.

/**
 * Reads an OSPI value as a number.
 * Numbers pass through. Suppressed ranges become a usable estimate:
 * "<3.7" -> 1.85 (midpoint of 0..3.7), ">95" -> 95. "N<10" and blanks -> null.
 */
export function num(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const s = String(value);
  if (/^n</i.test(s)) return null;
  if (s[0] === '<') return parseFloat(s.slice(1)) / 2;
  if (s[0] === '>') return parseFloat(s.slice(1));
  const f = parseFloat(s);
  return Number.isNaN(f) ? null : f;
}

/** Returns the value only if it is an exact (unsuppressed) number. */
export function exact(value) {
  return typeof value === 'number' ? value : null;
}

export function isSuppressed(value) {
  return typeof value === 'string' && /^[<>]|^n</i.test(value);
}

export function mean(values) {
  const v = values.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Text box input ----
// Keeps what can appear in a school name, a street address or a ZIP code:
// letters (any language), digits, spaces and  ' ’ - . , & # / :
// Everything else (< > " ; { } $ % * = emoji, control characters…) is dropped as it is typed or pasted.
const NOT_ALLOWED = /[^\p{L}\p{M}\p{N} '’.,&#/:-]/gu;
export const INPUT_MAX = 100;

export function cleanText(s, max = INPUT_MAX) {
  return String(s ?? '').normalize('NFC').replace(/\s/g, ' ').replace(NOT_ALLOWED, '').slice(0, max);
}

/** Lowercase, punctuation-free form used for matching ("Impact | Salish Sea" -> "impact salish sea"). */
export function searchKey(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\p{M}'’]/gu, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** True when every word of the query appears in the text, in any order ("atlas summit" finds "Summit Atlas"). */
export function matchesWords(text, query) {
  const key = searchKey(text);
  return searchKey(query).split(' ').every((w) => key.includes(w));
}

/**
 * Filters a text box as the user types or pastes. Register before any other
 * 'input' listener on the same box so those listeners see the cleaned value.
 */
export function guardInput(input, hint) {
  input.maxLength = INPUT_MAX;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  let composing = false;
  let timer;
  const apply = () => {
    const raw = input.value;
    const clean = cleanText(raw);
    if (clean === raw) return;
    const caret = cleanText(raw.slice(0, input.selectionStart ?? raw.length)).length;
    input.value = clean;
    try { input.setSelectionRange(caret, caret); } catch { /* type=search in old Safari */ }
    if (hint) {
      hint.textContent = "Left out a character that can't be part of a school name or address.";
      clearTimeout(timer);
      timer = setTimeout(() => { hint.textContent = ''; }, 3000);
    }
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; apply(); input.dispatchEvent(new Event('input')); });
  input.addEventListener('input', () => { if (!composing) apply(); });
}

/** Privacy ranges like "<0.0146" read as "<0.015": two significant digits, rounded so the bound stays true. */
export function tidyRange(value) {
  const m = /^([<>])\s*(\d*\.?\d+)$/.exec(String(value));
  if (!m) return value;
  const n = Number(m[2]);
  if (!(n > 0) || n >= 1 || String(m[2]).replace(/^0\.0*/, '').length <= 2) return value;
  const scale = 10 ** (1 - Math.floor(Math.log10(n)));
  const r = (m[1] === '<' ? Math.ceil(n * scale) : Math.floor(n * scale)) / scale;
  return m[1] + Number(r.toPrecision(2));
}

/** One decimal place, always shown (91 -> "91.0"), so columns of percentages line up. */
export function oneDp(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Formats a value as HTML. Suppressed values are greyed and explained on hover. Percentages and point changes get one decimal. */
export function fmt(value, unit = '', { dp } = {}) {
  if (value == null || value === '') return '<span class="sup">—</span>';
  if (value === 'none') return 'None on staff';
  if (unit === '$' && typeof value === 'number') return `$${Math.round(value).toLocaleString()}`;
  if (typeof value === 'string') {
    if (/^n</i.test(value)) return '<span class="sup" title="Fewer than 10 students">n&lt;10</span>';
    return `<span class="sup" title="Suppressed for privacy; the true value is in this range">${escapeHtml(tidyRange(value))}${unit}</span>`;
  }
  if (dp === 1 || unit === '%' || unit === ' pts') return oneDp(value) + unit;
  return round1(value).toLocaleString() + unit;
}

/** Formats a value as plain text (for tooltips and chart labels). */
export function plain(value, unit = '') {
  if (value == null || value === '') return '—';
  if (value === 'none') return 'none on staff';
  if (unit === '$' && typeof value === 'number') return `$${Math.round(value).toLocaleString()}`;
  if (typeof value === 'string') return /^n</i.test(value) ? 'n<10' : tidyRange(value) + unit;
  if (unit === '%' || unit === ' pts') return oneDp(value) + unit;
  return round1(value).toLocaleString() + unit;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2a78d6';
}

export function isDarkTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---- Tooltip (one shared element) ----
const tip = () => document.getElementById('tip');

export function showTip(html, event) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = 'block';
  t.style.transform = '';
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let left = event.clientX + 14;
  let top = event.clientY + 14;
  if (left + w > innerWidth - 8) left = event.clientX - w - 14;
  if (top + h > innerHeight - 8) top = event.clientY - h - 14;
  t.style.left = Math.max(8, left) + 'px';
  t.style.top = Math.max(8, top) + 'px';
}

export function hideTip() {
  tip().style.display = 'none';
}

/** Shows a short message near the top of the screen. */
export function flash(message) {
  const t = tip();
  t.textContent = message;
  Object.assign(t.style, { display: 'block', left: '50%', top: '70px', transform: 'translateX(-50%)' });
  setTimeout(() => { t.style.display = 'none'; t.style.transform = ''; }, 2200);
}

/** Wires hover + tap tooltips onto SVG/HTML elements. */
export function bindTips(elements, htmlFor) {
  elements.forEach((el) => {
    const show = (e) => showTip(htmlFor(el), e);
    el.addEventListener('mousemove', show);
    el.addEventListener('mouseleave', hideTip);
  });
}

/** Local storage that never throws (private browsing, blocked storage). */
export const storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

export const session = {
  get(key) {
    try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set(key, value) {
    try { value == null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
