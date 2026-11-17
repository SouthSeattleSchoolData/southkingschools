// Helpers shared by the data build (build-data.js) and the one-time snapshot merge.

/** School years shown in trend charts: the last pre-pandemic year, then the four most recent. */
export function trendYears(latest) {
  const start = Number(latest.slice(0, 4));
  const label = (y) => `${y}-${String(y + 1).slice(2)}`;
  return ['2018-19', ...[3, 2, 1, 0].map((back) => label(start - back)).filter((y) => y >= '2021-22')];
}

/** Years in the checked-in snapshot. */
export const TREND_YEARS = trendYears('2024-25');

/**
 * A trend cell: number, privacy range ("<1", ">90") or null.
 * "x" marks a value OSPI hid entirely (fewer than 10 students, or "Top/Bottom range").
 */
export function parseTrendValue(v) {
  if (v == null || v === '' || v === 'x') return null;
  if (/^[<>]/.test(v)) return v === '<0' ? '<1' : v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Reduces one school's Civil Rights Data Collection row (field names as in tools/raw/crdc_*.csv,
 * already summed across sub-types) to what the site shows. Negative/missing = null.
 */
export function crdcRecord(r, year) {
  const v = (x) => (x == null || x === '' || Number.isNaN(Number(x)) || Number(x) < 0 ? null : Number(x));
  return {
    year,
    firearm_incident: v(r.firearm_incident),
    firearm_possession: v(r.firearm_possession),
    homicide: v(r.homicide),
    attacks_with_weapon: v(r.attacks_with_weapon),
    attacks: v(r.attacks),
    threats: v(r.threats),
    robbery: v(r.robbery),
    sexual_assault: v(r.sexual_assault),
    sexual_assault_by_staff: v(r.sexual_assault_by_staff),
    harassment_allegations: v(r.harassment_allegations),
    bullying: {
      sex: v(r.bully_sex),
      race: v(r.bully_race),
      disability: v(r.bully_disability),
      orientation: v(r.bully_orientation),
      religion: v(r.bully_religion),
    },
    arrests: v(r.arrests),
    police_referrals: v(r.police_referrals),
    restraint_physical: v(r.physical_restraint),
    restraint_mechanical: v(r.mechanical_restraint),
    seclusion: v(r.seclusion),
    staff: {
      teachers: v(r.teachers_fte),
      counselors: v(r.counselors_fte),
      psychologists: v(r.psychologists_fte),
      social_workers: v(r.social_workers_fte),
      nurses: v(r.nurses_fte),
      security: v(r.security_guard_fte),
      police: v(r.law_enforcement_fte),
    },
  };
}

/** Key for matching Department of Health lead-test listings to OSPI school names. */
export function leadMatchKey(name, district) {
  const n = String(name || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(school|schools|senior|sr|jr|the|k-8|pk-8|campus)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
  const d = String(district || '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0];
  return `${d}:${n}`;
}

/** Incident and restraint counts from an earlier collection, kept so pages can show the change. */
export const CRDC_PREV_KEYS = ['enrollment', 'firearm_possession', 'attacks_with_weapon', 'attacks', 'threats', 'robbery', 'sexual_assault',
  'harassment_allegations', 'arrests', 'police_referrals', 'restraint_physical', 'restraint_mechanical', 'seclusion'];
export function crdcPrevious(rec) {
  return rec ? Object.fromEntries([['year', rec.year], ...CRDC_PREV_KEYS.map((k) => [k, rec[k]])]) : null;
}
