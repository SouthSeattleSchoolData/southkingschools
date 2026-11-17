// Definitions: the ⓘ hover/tap tips next to headers and labels, and the Glossary page.
// Wording lives in content/glossary.json.

import { store } from './data.js';
import { escapeHtml, hideTip, $ } from './util.js';
import { SCORE_NAMES } from './scores.js';

/** Maps a metric key used in the code to its glossary entry key. */
export function glossaryKey(metricKey) {
  if (metricKey in SCORE_NAMES) return `score:${metricKey}`;
  if (metricKey.startsWith('discipline_') && metricKey !== 'discipline_all') return 'discipline_group';
  return metricKey;
}

/** A small ⓘ button that explains a term. Returns '' if there's no definition. */
export function info(key) {
  const entry = store.glossary[key];
  if (!entry) return '';
  return `<button class="info" type="button" data-term="${escapeHtml(key)}" aria-label="What is ${escapeHtml(entry.term)}?">i</button>`;
}

/** Label text followed by its ⓘ button. */
export function withInfo(label, key) {
  return `${label}${info(key)}`;
}

function tipHtml(key) {
  const e = store.glossary[key];
  return `<b>${escapeHtml(e.term)}</b>${escapeHtml(e.what)}${e.read ? `<span class="tipread">${escapeHtml(e.read)}</span>` : ''}`;
}

/** Shows the tip next to a button (works for mouse, touch and keyboard). */
function showFor(button) {
  const tip = document.getElementById('tip');
  tip.innerHTML = tipHtml(button.dataset.term);
  tip.style.display = 'block';
  tip.style.transform = '';
  const r = button.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  let top = r.bottom + 8;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

let pinned = null;

/** One set of listeners for every ⓘ button on the site, present or future. */
export function initInfoTips() {
  // Capture phase so a tap on ⓘ doesn't also open the row or sort the column it sits in.
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.info');
    if (button) {
      e.preventDefault();
      e.stopPropagation();
      if (pinned === button) { pinned = null; hideTip(); } else { pinned = button; showFor(button); }
      return;
    }
    if (pinned) { pinned = null; hideTip(); }
  }, true);

  document.addEventListener('pointerover', (e) => {
    const button = e.target.closest?.('.info');
    if (button && e.pointerType === 'mouse' && !pinned) showFor(button);
  });
  document.addEventListener('pointerout', (e) => {
    const button = e.target.closest?.('.info');
    if (button && e.pointerType === 'mouse' && !pinned) hideTip();
  });
  document.addEventListener('focusin', (e) => { if (e.target.matches?.('.info')) showFor(e.target); });
  document.addEventListener('focusout', (e) => { if (e.target.matches?.('.info') && !pinned) hideTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { pinned = null; hideTip(); } });
  addEventListener('scroll', () => { pinned = null; }, { passive: true });
}

let rendered = false;

/** The Glossary page. */
export function renderGlossary() {
  if (rendered) return;
  rendered = true;
  $('#glossaryBody').innerHTML = store.glossaryGroups.map((g) => `
    <section class="gloss-group">
      <h3>${escapeHtml(g.title)}</h3>
      ${g.intro ? `<p class="small" style="color:var(--ink-2)">${escapeHtml(g.intro)}</p>` : ''}
      <dl>${g.items.map((i) => `
        <div class="gloss-item" id="term-${escapeHtml(i.key.replace(/[^a-z0-9]+/gi, '-'))}">
          <dt>${escapeHtml(i.term)}</dt>
          <dd>${escapeHtml(i.what)}${i.read ? `<span class="gloss-read"><b>How to read it:</b> ${escapeHtml(i.read)}</span>` : ''}</dd>
        </div>`).join('')}
      </dl>
    </section>`).join('');
}
