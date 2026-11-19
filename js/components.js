// Small pieces of markup reused by several pages.

import { SCORE_NAMES, scoreColorVar, scoreKeysFor } from './scores.js';
import { info } from './glossary.js';

/** The four score bars shown on search results. */
export function scoreBars(school) {
  if (!school.scores) return '<div class="xs muted">Not scored: special program or too few students.</div>';
  const rows = scoreKeysFor(school).map((key) => {
    const name = SCORE_NAMES[key];
    const v = school.scores[key];
    const width = v == null ? 0 : Math.max(3, v);
    return `<div class="sc"><span>${name}${info(`score:${key}`)}</span><div class="trk"><div class="fill" style="width:${width}%;background:var(${scoreColorVar(v)})"></div></div><b>${v == null ? '<span class="sup">—</span>' : v}</b></div>`;
  });
  return `<div class="scores">${rows.join('')}</div>`;
}

export function tagList(school) {
  return school.tags.map((t) => `<span class="tag">${t}</span>`).join('');
}

/** Five-step color legend for score shading. */
export function scoreRamp() {
  return `<span class="ramp">${['--q1', '--q2', '--q3', '--q4', '--q5'].map((v) => `<i style="background:var(${v})"></i>`).join('')}</span>`;
}
