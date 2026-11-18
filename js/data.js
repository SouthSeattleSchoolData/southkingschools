// Loads the data files and adds a few derived fields used across the site.

export const AREAS = ['Renton', 'Kent', 'Issaquah', 'Bellevue', 'West Seattle', 'South Seattle'];

/** District codes used in data/schools.json -> area that uses the district total. */
export const AREA_DISTRICT = { Renton: 'R', Kent: 'K', Issaquah: 'I', Bellevue: 'B' };

const SCHOOL_TYPE_TAGS = { A: 'Alternative', R: 'Re-engagement', S: 'Special ed', I: 'Institution' };

/** All loaded data lives here after loadData() resolves. */
export const store = {
  schools: [],
  districts: [],
  state: {},
  byCode: {},
  news: [],
  policies: [],
  meta: {},
  glossary: {},
  glossaryGroups: [],
  generated: '',
  schoolYear: '',
  trendYears: [],
  sources: {},
};

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.json();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Sort key for timeline dates like "Sep 25, 2026", "Mar 2026" or "Jun 3–12, 2024"; undated items go last. */
export function newsDateKey(text) {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(?:(\d{1,2})[^,]*,\s*)?(\d{4})/.exec(String(text || ''));
  if (!m) return -Infinity;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  return Number(m[3]) * 10000 + (month + 1) * 100 + Number(m[2] || 0);
}

export async function loadData() {
  const [data, news, policies, meta, glossary, i18n, feeders] = await Promise.all([
    getJson('data/schools.json'),
    getJson('content/news.json'),
    getJson('content/policies.json'),
    getJson('content/meta.json'),
    getJson('content/glossary.json'),
    getJson('content/i18n.json').catch(() => null),
    getJson('content/feeders.json').catch(() => null),
  ]);
  store.schools = data.schools.map(prepareSchool);
  store.districts = data.districts;
  store.state = data.state;
  store.generated = data.generated;
  store.schoolYear = data.school_year;
  store.trendYears = data.trend_years || [];
  store.disciplineTrend = data.discipline_trend || null;
  store.districtPoverty = data.district_poverty || null;
  store.sources = data.sources || {};
  store.byCode = Object.fromEntries(store.schools.map((s) => [s.code, s]));
  store.news = news.map((n, i) => ({ n, i })).sort((a, b) => newsDateKey(b.n.date) - newsDateKey(a.n.date) || a.i - b.i).map(({ n }) => n);
  store.policies = policies;
  store.meta = meta;
  store.i18n = i18n;
  store.feeders = feeders;
  store.glossaryGroups = glossary.groups;
  store.glossary = Object.fromEntries(glossary.groups.flatMap((g) => g.items.map((i) => [i.key, i])));
}

/** Grade span like "PK-5" -> Elementary / Middle / High / K-8 / 6-12 / Preschool. */
export function schoolLevel(grades) {
  const parts = (grades || '').split('-');
  if (parts.length < 2) return 'Other';
  const n = (g) => (g === 'PK' ? -2 : g === 'TK' ? -1 : g === 'K' ? 0 : Number(g));
  const [lo, hi] = parts.map(n);
  if (hi <= 0) return 'Preschool';
  if (lo >= 9) return 'High';
  if (lo >= 6 && hi <= 8) return 'Middle';
  if (hi <= 6) return 'Elementary';
  return 'K-8 / 6-12';
}

export function prepareSchool(s) {
  const tags = [];
  if (s.is_charter) tags.push('Charter');
  if (SCHOOL_TYPE_TAGS[s.school_type]) tags.push(SCHOOL_TYPE_TAGS[s.school_type]);
  const online = /Virtual|Digital/.test(s.name);
  if (online) tags.push('Online');

  const level = schoolLevel(s.grades);
  // Programs serve students with different needs; they aren't scored against neighborhood schools.
  const isProgram = ['S', 'I', 'R'].includes(s.school_type) || level === 'Preschool' || online || /H\.O\.M\.E/.test(s.name);

  return { ...s, level, tags, isProgram, lat: s.lat || null, lon: s.lon || null };
}

/** Name to show for a school's district ("Charter school" for charters). */
export function districtLabel(school) {
  if (school.is_charter) return 'Charter school';
  return school.district === 'Seattle School District No. 1' ? 'Seattle Public Schools' : school.district;
}

export function districtFor(school) {
  if (school.is_charter) return null;
  return store.districts.find((d) => d.district === school.district) || null;
}

export function districtByCode(code) {
  return store.districts.find((d) => d.district_code === code) || null;
}
