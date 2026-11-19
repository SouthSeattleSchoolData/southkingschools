// The four 0–100 scores. Each is a percentile among schools at the same level in these areas.
// See the "How it works" page for the plain-language version of these rules.

import { num, exact, mean } from './util.js';

export const SCORE_NAMES = {
  academics: 'Academics',
  growth: 'Growth',
  equity: 'Equity',
  climate: 'Climate',
};

/** Smallest enrollment a school needs to be scored. */
const MIN_ENROLLMENT = 60;
/** A percentile needs at least this many peers to mean anything. */
const MIN_PEERS = 8;
/** Schools a level needs before it gets its own income trend line. */
const MIN_LEVEL_FIT = 15;

/** Average of reading and math proficiency (either one if the other is missing). */
export function readingMathAverage(s) {
  const e = num(s.ela_proficient);
  const m = num(s.math_proficient);
  if (e != null && m != null) return (e + m) / 2;
  return e ?? m;
}

/** Least-squares line y = a + b·x, plus R². */
export function fitLine(points) {
  const n = points.length;
  const mx = points.reduce((t, p) => t + p.x, 0) / n;
  const my = points.reduce((t, p) => t + p.y, 0) / n;
  const sxy = points.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0);
  const sxx = points.reduce((t, p) => t + (p.x - mx) ** 2, 0);
  const b = sxy / sxx;
  const a = my - b * mx;
  const ssRes = points.reduce((t, p) => t + (p.y - (a + b * p.x)) ** 2, 0);
  const ssTot = points.reduce((t, p) => t + (p.y - my) ** 2, 0);
  return { a, b, r2: 1 - ssRes / ssTot };
}

/** Line of a measure against low-income share, across the given schools. */
export function incomeTrend(schools, getY) {
  const points = schools
    .map((s) => ({ s, x: num(s.pct_low_income), y: getY(s) }))
    .filter((p) => p.x != null && p.y != null);
  return { points, ...fitLine(points) };
}

function peerGroup(s) {
  return ['Elementary', 'Middle', 'High'].includes(s.level) ? s.level : 'Mixed';
}

/**
 * Percentile rank of a school's value among its peers (0–100). Ties count half.
 * `higherIsBetter=false` flips the direction (e.g. suspension rates).
 */
function percentile(school, peers, getValue, higherIsBetter = true) {
  const v = getValue(school);
  if (v == null) return null;
  const values = peers.map(getValue).filter((x) => x != null);
  if (values.length < MIN_PEERS) return null;
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (higherIsBetter ? x < v : x > v) below++;
    else if (x === v) equal++;
  }
  return (100 * (below + equal / 2)) / values.length;
}

/**
 * Adds to each eligible school:
 *   resid           reading+math minus what the low-income trend predicts (all levels together)
 *   vsSimilar       the same, against a trend fitted within the school's level; expectedProf is the prediction
 *   lowIncomeProf   low-income students' own reading+math proficiency
 *   disabilityRatio suspension rate for students with disabilities ÷ the school's rate
 *   scores          { academics, growth, equity, climate } as 0–100 or null
 * Returns the income trend so charts can reuse it.
 */
export function computeScores(schools) {
  const eligible = schools.filter((s) => !s.isProgram && s.enrollment >= MIN_ENROLLMENT);
  const trend = incomeTrend(eligible, readingMathAverage);

  for (const s of eligible) {
    const y = readingMathAverage(s);
    const x = num(s.pct_low_income);
    s.resid = y != null && x != null ? y - (trend.a + trend.b * x) : null;

    const swd = exact(s.discipline?.disability);
    const all = exact(s.discipline?.all);
    s.disabilityRatio = swd != null && all ? swd / all : null;

    const lie = num(s.ela_proficient_low_income);
    const lim = num(s.math_proficient_low_income);
    s.lowIncomeProf = lie != null && lim != null ? (lie + lim) / 2 : (lie ?? lim);
  }

  // "Compared with similar schools": the same income trend, fitted within each level so high
  // schools are measured against high schools. Groups too small for a stable line use the overall one.
  const levelTrend = {};
  for (const group of ['Elementary', 'Middle', 'High', 'Mixed']) {
    const t = incomeTrend(eligible.filter((p) => peerGroup(p) === group), readingMathAverage);
    levelTrend[group] = t.points.length >= MIN_LEVEL_FIT ? t : trend;
  }
  for (const s of eligible) {
    const y = readingMathAverage(s);
    const x = num(s.pct_low_income);
    if (y == null || x == null) continue;
    const t = levelTrend[peerGroup(s)];
    s.expectedProf = Math.round((t.a + t.b * x) * 10) / 10;
    s.vsSimilar = Math.round((y - (t.a + t.b * x)) * 10) / 10;
    s.vsSimilarPeers = t === trend ? 'schools' : `${peerGroup(s).toLowerCase()} schools`;
  }

  for (const s of eligible) {
    const group = peerGroup(s);
    const peers = group === 'Mixed' ? eligible : eligible.filter((p) => peerGroup(p) === group);
    const pct = (get, high = true) => percentile(s, peers, get, high);

    const scores = {
      academics: mean([
        pct((p) => num(p.ela_proficient)),
        pct((p) => num(p.math_proficient)),
        pct((p) => num(p.science_proficient)),
      ]),
      growth: mean([pct((p) => num(p.growth_ela)), pct((p) => num(p.growth_math))]),
      equity: mean([
        pct((p) => p.resid),
        pct((p) => p.lowIncomeProf),
        s.disabilityRatio != null ? pct((p) => p.disabilityRatio, false) : null,
      ]),
      climate: mean([
        pct((p) => num(p.regular_attendance)),
        pct((p) => num(p.discipline?.all), false),
        s.level === 'High' ? pct((p) => num(p.ninth_grade_on_track)) : null,
      ]),
    };
    for (const k in scores) if (scores[k] != null) scores[k] = Math.round(scores[k]);
    s.scores = scores;
    s.peerGroup = group;
  }
  return trend;
}

/** CSS variable for a 0–100 score (single-hue blue ramp; grey when missing). */
export function scoreColorVar(score) {
  if (score == null) return '--mute';
  if (score >= 80) return '--q5';
  if (score >= 60) return '--q4';
  if (score >= 40) return '--q3';
  if (score >= 20) return '--q2';
  return '--q1';
}
