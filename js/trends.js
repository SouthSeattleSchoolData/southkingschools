// Year-over-year helpers: peer medians, recovery since 2018-19, and how much a school's numbers jump around.

import { store, AREAS } from './data.js';


/** Trend series the site shows, with labels and chart settings. */
export const TREND_SERIES = [
  ['ela', 'Reading proficiency', 'Reading proficiency (%)', 100],
  ['math', 'Math proficiency', 'Math proficiency (%)', 100],
  ['att', 'Regular attendance', 'Regular attendance (%)', 100],
  ['disc', 'Suspended or expelled', 'Suspended or expelled (%)', null],
];

/** Fixed color per area: color follows the area everywhere. */
export const AREA_COLORS = Object.fromEntries(AREAS.map((a, i) => [a, `--c${i + 1}`]));

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) * 10) / 10;
};

const comparable = (s) => s.trend && !s.isProgram;

/** Median per year across a set of schools (exact values only). */
export function medianSeries(schools, key) {
  return store.trendYears.map((_, i) => median(schools.filter(comparable).map((s) => s.trend[key][i])));
}

/** Same-level schools across the six areas. */
export const peerSeries = (s, key) => medianSeries(store.schools.filter((x) => x.level === s.level), key);

/** Median per year for each area. */
export const areaSeries = (key, level) => AREAS.map((a) => ({
  name: a,
  color: AREA_COLORS[a],
  values: medianSeries(store.schools.filter((x) => x.area === a && (!level || x.level === level)), key),
}));

/**
 * Average size of the year-to-year jumps in reading and math since 2021-22, in points.
 * Big jumps at a steady school usually mean small test groups, not real change.
 */
export function volatility(s) {
  if (!s.trend) return null;
  const jumps = [];
  for (const key of ['ela', 'math']) {
    const v = s.trend[key].slice(1);
    for (let i = 1; i < v.length; i++) if (typeof v[i] === 'number' && typeof v[i - 1] === 'number') jumps.push(Math.abs(v[i] - v[i - 1]));
  }
  return jumps.length >= 3 ? Math.round((jumps.reduce((a, b) => a + b, 0) / jumps.length) * 10) / 10 : null;
}

/** Thresholds for the small-school caution. */
export const SMALL = { enrollment: 150, jump: 8 };

/** Why a school's single-year numbers deserve caution, or null. */
export function smallSchoolCaution(s) {
  if (s.isProgram) return null;
  const vol = volatility(s);
  if (s.enrollment < SMALL.enrollment) return { kind: 'size', text: `Only ${s.enrollment} students. A few students more or less passing a test moves the percentages a lot, so look at the trend, not one year.` };
  if (vol != null && vol >= SMALL.jump) return { kind: 'swing', text: `Reading and math have moved an average of ${vol} points a year since 2021-22. That much movement usually means small test groups or changes in who's tested, so read single years loosely.` };
  return null;
}

/** Plain-language summary of the change since 2018-19 for one school. */
export function changeSummary(s) {
  if (!s.trend) return '';
  const parts = [];
  for (const [key, label] of [['ela', 'Reading'], ['math', 'Math']]) {
    const t = s.trend[key];
    const first = t[0];
    const last = t[t.length - 1];
    if (typeof first === 'number' && typeof last === 'number') {
      const d = Math.round((last - first) * 10) / 10;
      parts.push(`${label} ${d >= 0 ? 'is up' : 'is down'} ${Math.abs(d)} points since 2018-19 (${first}% to ${last}%).`);
    }
  }
  return parts.join(' ');
}

