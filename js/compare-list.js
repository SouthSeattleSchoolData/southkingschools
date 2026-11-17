// The visitor's compare list (up to four schools), remembered in this browser.

import { storage, flash } from './util.js';
import { store } from './data.js';

const KEY = 'sks-compare';
const MAX = 4;
let codes = [];

export function initCompareList() {
  const saved = storage.get(KEY, []);
  codes = (Array.isArray(saved) ? saved : []).map(String).filter((c) => store.byCode[c]).slice(0, MAX);
  updateBadge();
}

export const compareCodes = () => [...codes];
export const isCompared = (code) => codes.includes(code);

export function setCompare(list) {
  codes = list.slice(0, MAX);
  save();
}

/** Adds or removes a school. Returns false if the list is full. */
export function toggleCompare(code) {
  if (codes.includes(code)) {
    codes = codes.filter((c) => c !== code);
  } else {
    if (codes.length >= MAX) {
      flash('Compare holds four schools. Remove one first.');
      return false;
    }
    codes.push(code);
  }
  save();
  return true;
}

function save() {
  storage.set(KEY, codes);
  updateBadge();
}

function updateBadge() {
  const badge = document.getElementById('cmpCount');
  if (!badge) return;
  badge.textContent = codes.length;
  badge.hidden = !codes.length;
}

/** HTML for an "Add to compare" toggle button. */
export function compareButton(code, extraClass = '') {
  const on = isCompared(code);
  return `<button class="addbtn ${extraClass}${on ? ' on' : ''}" data-compare="${code}" type="button" aria-pressed="${on}">${on ? 'Added to compare' : 'Add to compare'}</button>`;
}

/** Wires every compare button inside `root`. */
export function wireCompareButtons(root) {
  root.querySelectorAll('[data-compare]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!toggleCompare(btn.dataset.compare)) return;
      const on = isCompared(btn.dataset.compare);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on);
      btn.textContent = on ? 'Added to compare' : 'Add to compare';
    });
  });
}
