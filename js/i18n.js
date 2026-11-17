// Interface translation. Dictionary keys are the exact English text the site shows, so pages need
// no special markup: after anything renders, short text nodes and a few attributes are swapped
// for the chosen language. Longer explanations stay in English (a notice says so).
// Add data-no-t to an element to keep its text in English (e.g. rating words like "High").

import { storage, $ } from './util.js';

const KEY = 'sks-lang';
const ATTRS = ['placeholder', 'aria-label', 'title'];
let dict = { languages: { en: 'English' }, strings: {}, patterns: [] };
let lang = 'en';
let patterns = [];
const original = new WeakMap(); // text node -> English text
let observer;

export const currentLang = () => lang;

/** English -> current language. Unknown text passes through unchanged. */
export function t(en) {
  if (lang === 'en' || !en) return en;
  const key = en.trim();
  const hit = dict.strings[key]?.[lang];
  if (hit) return en.replace(key, hit);
  for (const p of patterns) {
    const m = key.match(p.re);
    if (m && p[lang]) return en.replace(key, p[lang].replace(/\$(\d)/g, (_, i) => t(m[Number(i)])));
  }
  return en;
}

function translateNode(node) {
  if (!original.has(node)) original.set(node, node.nodeValue);
  const en = original.get(node);
  const out = lang === 'en' ? en : t(en);
  if (node.nodeValue !== out) node.nodeValue = out;
}

function skip(el) {
  return !el || el.closest('[data-no-t], script, style, textarea, .tip');
}

/** Translates every short text node and labelled attribute under `root`. */
export function translateTree(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() && n.nodeValue.length < 200 && !skip(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  while (walker.nextNode()) translateNode(walker.currentNode);
  const els = root.querySelectorAll ? root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')) : [];
  for (const el of [root, ...els]) {
    if (!el.getAttribute || skip(el)) continue;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const store = `data-en-${a}`;
      if (!el.hasAttribute(store)) el.setAttribute(store, el.getAttribute(a));
      el.setAttribute(a, lang === 'en' ? el.getAttribute(store) : t(el.getAttribute(store)));
    }
  }
}

function showNotice() {
  let bar = $('#langNotice');
  if (lang === 'en') { bar?.remove(); return; }
  if (!bar) {
    bar = Object.assign(document.createElement('div'), { id: 'langNotice', className: 'langnotice' });
    bar.setAttribute('data-no-t', '');
    document.querySelector('main')?.prepend(bar);
  }
  bar.textContent = dict.notice?.[lang] || '';
}

/** Loads the dictionary, builds the language menu and keeps new content translated. */
export function initI18n(data, onChange) {
  dict = data || dict;
  patterns = (dict.patterns || []).map((p) => ({ ...p, re: new RegExp(p.re) }));
  const saved = storage.get(KEY, null);
  const browser = (navigator.language || 'en').slice(0, 2);
  lang = dict.languages[saved] ? saved : dict.languages[browser] ? browser : 'en';

  const select = $('#langSel');
  if (select) {
    select.innerHTML = Object.entries(dict.languages).map(([code, name]) => `<option value="${code}" lang="${code}">${name}</option>`).join('');
    select.value = lang;
    select.addEventListener('change', () => {
      lang = select.value;
      storage.set(KEY, lang);
      apply();
      onChange?.();
    });
  }

  observer = new MutationObserver((records) => {
    if (lang === 'en') return;
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType === 3) { if (!skip(n.parentElement)) translateNode(n); } else if (n.nodeType === 1) translateTree(n);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  apply();
}

function apply() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  translateTree(document.body);
  showNotice();
}
