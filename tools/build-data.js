// Rebuilds data/schools.json from public sources. Runs in the browser (tools/update-data.html)
// and in Node 18+ (tools/update-data.mjs, used by the GitHub Action).
//
// Sources: OSPI Report Card files on data.wa.gov (Socrata API), King County school sites (ArcGIS),
// the NCES school directory (Urban Institute Education Data Portal API), and the federal
// Civil Rights Data Collection (checked in as tools/crdc-data.js; see tools/snapshot/build-crdc.mjs).

import { trendYears, parseTrendValue } from './shared.js';
import { CRDC, CRDC_PREV, CRDC_YEAR, CRDC_PREV_YEAR } from './crdc-data.js';

const SOCRATA = 'https://data.wa.gov';
const URBAN = 'https://educationdata.urban.org/api/v1';

// ---------- small helpers ----------

/** Queries a data.wa.gov dataset with SoQL parameters. */
async function soql(id, params) {
  const qs = Object.entries({ $limit: 50000, ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await fetch(`${SOCRATA}/resource/${id}.json?${qs}`);
  if (!res.ok) throw new Error(`data.wa.gov ${id}: ${res.status} ${await res.text()}`);
  return res.json();
}

const quote = (s) => `'${s.replace(/'/g, "''")}'`;
const inList = (values) => `(${values.map(quote).join(',')})`;

/** Percentage with one decimal, from counts. */
const pct = (part, total) => (total > 0 ? Math.round((1000 * part) / total) / 10 : null);

/**
 * Normalizes an OSPI value: "52.7%" -> 52.7, "<5%" -> "<5", "*" / "NULL" / "" -> null.
 * Suppressed ranges stay strings so the site can show them as ranges.
 */
export function clean(v) {
  if (v == null || v === '' || v === 'NULL' || v === '*') return null;
  if (/^(top\/bottom|no students)/i.test(String(v))) return null; // hidden by OSPI, no range given
  if (typeof v === 'number') return v;
  const s = String(v).replace(/%/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** First value that isn't empty. */
const pick = (...vals) => vals.find((v) => v != null && v !== '') ?? null;

/** OSPI switched some files (2025-26 test results) from "52.7%" text to 0.527 fractions. */
export function asPercent(v) {
  if (v == null || v === '') return v;
  const s = String(v).trim();
  return /^\d*\.?\d+$/.test(s) && Number(s) <= 1 ? Math.round(Number(s) * 1000) / 10 : v;
}

// ---------- dataset discovery ----------

/** "2025-26" -> "2024-25" */
export const previousYear = (year) => {
  const a = Number(year.slice(0, 4)) - 1;
  return `${a}-${String(a + 1).slice(2)}`;
};

/** Looks up one dataset ID by its exact name on data.wa.gov. */
async function findDataset(name) {
  const res = await fetch(`${SOCRATA}/api/catalog/v1?domains=data.wa.gov&only=datasets&limit=10&q=${encodeURIComponent(name)}`);
  const hits = (await res.json()).results || [];
  const lower = name.toLowerCase();
  // Some years are published with a suffix such as " - Final"; prefer the exact name.
  const hit = hits.find((h) => h.resource.name.trim().toLowerCase() === lower)
    || hits.find((h) => h.resource.name.trim().toLowerCase().startsWith(`${lower} -`));
  return hit ? hit.resource.id : null;
}

/**
 * Finds the dataset IDs for a school year. OSPI releases files at different times (discipline and
 * graduation come months after test scores), so a file not out yet falls back to the year before;
 * `years` records which year each file came from.
 */
export async function findDatasets(year, config, log, { keys = Object.keys(config.DATASET_NAMES), fallback = 2 } = {}) {
  const ids = { years: {} };
  for (const key of keys) {
    let y = year;
    for (let tries = 0; tries <= fallback; tries++, y = previousYear(y)) {
      const known = config.DATASETS[y]?.[key];
      const id = known || await findDataset(config.DATASET_NAMES[key].replace('{year}', y));
      if (id) {
        ids[key] = id;
        ids.years[key] = y;
        if (y !== year) log(`${key}: ${year} isn't published yet, using ${y}`);
        break;
      }
    }
    if (!ids[key]) throw new Error(`Couldn't find the ${key} file for ${year} on data.wa.gov. Add its ID to DATASETS in tools/config.js.`);
  }
  return ids;
}

// ---------- school locations ----------

async function arcgis(config, where, fields) {
  const body = new URLSearchParams({ where, outFields: fields, f: 'json', returnGeometry: 'false', resultRecordCount: '2000' });
  const res = await fetch(config.SCHOOL_SITES_URL, { method: 'POST', body });
  const json = await res.json();
  if (json.error) throw new Error(`King County school sites: ${json.error.message}`);
  return (json.features || []).map((f) => f.attributes);
}

/** Name without generic words, for fuzzy matching ("Hazen Senior High School" -> "hazen"). */
const normalizeName = (s) => s.toLowerCase()
  .replace(/\b(elementary|school|middle|high|senior|international|k-8|pk-8|prek-8|jr\.?|the|of|and|academy|stem)\b/g, '')
  .replace(/[^a-z]/g, '');

const levelWord = (name) => (/elementary/i.test(name) ? 'Elementary' : /middle/i.test(name) ? 'Middle' : /high/i.test(name) ? 'High' : '');

/** Builds a lookup (OSPI code + name) -> location from the King County layer. */
async function loadLocations(config, schoolCodes, log) {
  const fields = 'OSPI_CODE,NAME,ADDRESS,ZIPCODE,DISTRICT,FEATUREDES,LAT_CEN,LONG_CEN';
  const byCode = {};
  for (let i = 0; i < schoolCodes.length; i += 100) {
    const chunk = schoolCodes.slice(i, i + 100);
    (await arcgis(config, `OSPI_CODE in (${chunk.join(',')})`, fields)).forEach((a) => { byCode[a.OSPI_CODE] = a; });
  }
  const allSites = await arcgis(config, `DISTRICT in ${inList(config.SCHOOL_SITE_DISTRICTS)}`, fields);
  log(`King County school sites: ${Object.keys(byCode).length} matched by code, ${allSites.length} sites to match by name`);
  const siteDistrict = Object.fromEntries(config.DISTRICTS.map((d) => [d.name, d.name.split(' ')[0].toUpperCase()]));

  return function locate(row) {
    const manual = config.MANUAL_LOCATIONS[row.schoolcode];
    if (manual) return { LAT_CEN: manual.lat, LONG_CEN: manual.lon, ADDRESS: manual.address, ZIPCODE: manual.zip };
    if (byCode[Number(row.schoolcode)]) return byCode[Number(row.schoolcode)];

    const raw = row.schoolname.toLowerCase();
    const exactName = allSites.find((a) => a.NAME && a.NAME.toLowerCase() === raw);
    if (exactName) return exactName;

    const n = normalizeName(row.schoolname);
    const district = siteDistrict[row.districtname];
    const level = levelWord(row.schoolname);
    const candidates = allSites
      .filter((a) => a.NAME && (!district || a.DISTRICT === district) && !/Other Facility|College/.test(a.FEATUREDES || ''))
      .map((a) => ({ a, n: normalizeName(a.NAME) }))
      .filter((c) => c.n && (c.n === n || ((c.n.includes(n) || n.includes(c.n)) && Math.abs(c.n.length - n.length) <= 6)));
    const score = (c) => Math.abs(c.n.length - n.length) - (level && (c.a.FEATUREDES || '').includes(level) ? 10 : 0);
    candidates.sort((x, y) => score(x) - score(y));
    return candidates[0]?.a || null;
  };
}

// ---------- main build ----------

/**
 * Builds the full schools.json object for a school year.
 * @param {string} year e.g. "2025-26"
 * @param {object} config the exports of tools/config.js
 * @param {(msg:string)=>void} log progress messages
 */
export async function buildData(year, config, log = () => {}) {
  const ids = await findDatasets(year, config, log);
  const districtNames = [...config.DISTRICTS.map((d) => d.name), ...Object.keys(config.CHARTERS)];
  const inDistricts = `districtname in ${inList(districtNames)}`;
  // Newer files (e.g. WaKids 2025-26) identify schools only by organization ID; map those to OSPI codes.
  const codeByOrg = {};
  const key = (r) => (r.organizationlevel === 'School' ? (r.schoolcode ?? codeByOrg[r.schoolorganizationid]) : `D:${r.districtname}`);
  const index = (rows, fn) => {
    const m = {};
    rows.forEach((r) => { m[key(r)] ??= {}; fn(m[key(r)], r); });
    return m;
  };

  log('Downloading enrollment…');
  const enrollment = await soql(ids.enrollment, { $where: `${inDistricts} and gradelevel='All Grades'` });
  enrollment.forEach((r) => { if (r.schoolorganizationid && r.schoolcode) codeByOrg[r.schoolorganizationid] = r.schoolcode; });

  log('Downloading test results…');
  const assessment = index(await soql(ids.assessment, {
    $where: `${inDistricts} and gradelevel='All Grades' and studentgroup='All Students' and test_administration_group!='AIM'`,
    $select: 'organizationlevel,districtname,schoolcode,testsubject,percent_consistent_grade,dat',
  }), (o, r) => { o[r.testsubject] = pick(asPercent(r.percent_consistent_grade), r.dat); });
  const lowIncomeTests = index(await soql(ids.assessment, {
    $where: `${inDistricts} and gradelevel='All Grades' and test_administration_group!='AIM' and studentgroup='Low-Income'`,
    $select: 'organizationlevel,districtname,schoolcode,testsubject,percent_consistent_grade,dat',
  }), (o, r) => { o[r.testsubject] = pick(asPercent(r.percent_consistent_grade), r.dat); });

  log('Downloading discipline…');
  const groups = { 'All Students': 'all', 'Students with Disabilities': 'disability', 'Black/ African American': 'black', 'Hispanic/ Latino of any race(s)': 'hispanic', White: 'white', Asian: 'asian', 'Low-Income': 'low_income' };
  const disciplineRows = await soql(ids.discipline, {
    $where: `${inDistricts} and gradelevel='All' and student_group in ${inList(Object.keys(groups))}`,
    $select: 'organizationlevel,districtname,schoolcode,student_group,disciplinerate,disciplinenumerator',
  });
  const discipline = index(disciplineRows, (o, r) => {
    o[groups[r.student_group]] = r.disciplinerate;
    if (r.student_group === 'All Students') o.count = r.disciplinenumerator;
  });

  log('Downloading graduation, attendance and growth…');
  const graduation = index(await soql(ids.graduation, {
    $where: `${inDistricts} and studentgroup='All Students' and cohort='Four Year'`,
    $select: 'organizationlevel,districtname,schoolcode,graduationrate,dat',
  }), (o, r) => { o.rate = r.graduationrate ? Math.round(1000 * r.graduationrate) / 10 : (r.dat || null); });
  const sqss = index(await soql(ids.sqss, {
    $where: `${inDistricts} and studentgroup='All Students' and gradelevel='All Grades'`,
    $select: 'organizationlevel,districtname,schoolcode,measure,label',
  }), (o, r) => { o[r.measure] = r.label; });
  const growth = index(await soql(ids.growth, {
    $where: `${inDistricts} and studentgroup='All Students' and gradelevel='All Grades'`,
    $select: 'organizationlevel,districtname,schoolcode,subject,mediansgp',
  }), (o, r) => { o[r.subject] = r.mediansgp; });
  const wakids = index((await soql(ids.wakids, {
    $where: `${inDistricts} and studentgroup='All Students' and measure='NumberofDomainsReadyforKindergarten' and measurevalue='6'`,
  })).filter((r) => !r.developmentlevel), (o, r) => { o.ready = r.percent ? Math.round(1000 * r.percent) / 10 : (r.suppress || null); });
  const ratios = {};
  const ratioYears = (await soql(config.RATIO_DATASET, { $select: 'schoolyear', $group: 'schoolyear', $order: 'schoolyear desc' })).map((r) => r.schoolyear);
  const ratioYear = ratioYears.includes(year) ? year : ratioYears[0];
  (await soql(config.RATIO_DATASET, {
    $where: `schoolyear='${ratioYear}' and county='King' and organizationlevel='School'`,
    $select: 'schoolcode,studenttoteacherratio',
  })).forEach((r) => { ratios[r.schoolcode] = r.studenttoteacherratio; });

  const schoolCodes = [...new Set(enrollment.filter((r) => r.organizationlevel === 'School').map((r) => r.schoolcode))];

  log('Downloading grade spans…');
  const gradeOrder = ['Pre-Kindergarten', 'Transition to Kindergarten', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', '11th Grade', '12th Grade'];
  const gradeLabels = ['PK', 'TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const gradesBySchool = {};
  (await soql(ids.enrollment, {
    $where: `organizationlevel='School' and schoolcode in ${inList(schoolCodes)} and gradelevel!='All Grades'`,
    $select: 'schoolcode,gradelevel,all_students',
  })).forEach((r) => {
    const i = gradeOrder.indexOf(r.gradelevel);
    if (Number(r.all_students) > 0 && i >= 0) (gradesBySchool[r.schoolcode] ??= []).push(i);
  });

  log('Matching school locations…');
  const locate = await loadLocations(config, schoolCodes, log);

  log('Downloading the NCES school directory…');
  let nces = {};
  try {
    nces = await loadNcesDirectory(schoolCodes);
  } catch (err) {
    log(`NCES directory unavailable (${err.message}); previous values will be kept.`);
  }
  const crdc = CRDC;
  log(`Federal data: ${Object.keys(nces).length} schools matched to NCES IDs, ${schoolCodes.filter((c) => crdc[c]).length} with CRDC ${CRDC_YEAR} records.`);

  log('Downloading trends, teacher experience and spending…');
  const years = trendYears(ids.years.assessment);
  const trends = await loadTrends(config, schoolCodes, years, log);
  const teachers = await loadTeachers(schoolCodes, year);
  const spending = await loadSpending(schoolCodes, year);

  log('Downloading state benchmarks…');
  const state = await loadState(ids);

  // ---------- assemble ----------
  const districtByName = Object.fromEntries(config.DISTRICTS.map((d) => [d.name, d]));
  const schools = [];
  const districts = [];

  for (const r of enrollment) {
    const isSchool = r.organizationlevel === 'School';
    const k = key(r);
    const total = Number(r.all_students);
    const d = districtByName[r.districtname];
    const loc = isSchool ? locate(r) : null;
    const zip = loc ? String(loc.ZIPCODE) : null;

    let area = d?.area ?? null;
    if (config.CHARTERS[r.districtname]) area = config.CHARTERS[r.districtname];
    if (isSchool && !area) {
      area = Object.entries(config.SEATTLE_AREAS).find(([, zips]) => zips.includes(zip))?.[0] ?? null;
    }
    if (!isSchool) {
      if (!d) continue; // charters have no district total worth showing
      area = d.area ?? 'Seattle (all)';
    }
    if (isSchool && !area) continue; // outside the six areas

    const spans = gradesBySchool[r.schoolcode] || [];
    const record = {
      area,
      school_type: r.currentschooltype || null,
      grades: spans.length ? `${gradeLabels[Math.min(...spans)]}-${gradeLabels[Math.max(...spans)]}` : null,
      enrollment: total,
      pct_low_income: pct(+r.low_income, total),
      pct_english_learners: pct(+r.english_language_learners, total),
      pct_disability: pct(+r.students_with_disabilities, total),
      pct_highly_capable: pct(+r.highly_capable, total),
      pct_asian: pct(+r.asian, total),
      pct_black: pct(+r.black_african_american, total),
      pct_hispanic: pct(+r.hispanic_latino_of_any_race, total),
      pct_white: pct(+r.white, total),
      pct_two_or_more: pct(+r.two_or_more_races, total),
      pct_pacific_islander: pct(+r.native_hawaiian_other_pacific, total),
      pct_homeless: pct(+r.homeless, total),
      ela_proficient: clean(assessment[k]?.ELA),
      math_proficient: clean(assessment[k]?.Math),
      science_proficient: clean(assessment[k]?.Science),
      ela_proficient_low_income: clean(lowIncomeTests[k]?.ELA),
      math_proficient_low_income: clean(lowIncomeTests[k]?.Math),
      growth_ela: clean(growth[k]?.['English Language Arts']),
      growth_math: clean(growth[k]?.Math),
      regular_attendance: clean(sqss[k]?.['Regular Attendance']),
      grad_rate_4yr: clean(graduation[k]?.rate ?? null),
      ninth_grade_on_track: clean(sqss[k]?.['Ninth Grade on Track']),
      dual_credit: clean(sqss[k]?.['Dual Credit']),
      kindergarten_ready: clean(wakids[k]?.ready ?? null),
      students_per_teacher: isSchool ? clean(ratios[r.schoolcode]) : null,
      discipline: {
        all: clean(discipline[k]?.all),
        count: clean(discipline[k]?.count),
        disability: clean(discipline[k]?.disability),
        black: clean(discipline[k]?.black),
        hispanic: clean(discipline[k]?.hispanic),
        white: clean(discipline[k]?.white),
        asian: clean(discipline[k]?.asian),
        low_income: clean(discipline[k]?.low_income),
      },
    };

    if (isSchool) {
      schools.push({
        code: r.schoolcode,
        name: r.schoolname.replace(/ School$/, ''),
        district: r.districtname,
        is_charter: !!config.CHARTERS[r.districtname],
        area,
        school_type: record.school_type,
        grades: record.grades,
        ...location(loc, nces[r.schoolcode], zip),
        nces_id: nces[r.schoolcode]?.id ?? null,
        ...withoutKeys(record, ['area', 'school_type', 'grades']),
        crdc: crdc[r.schoolcode] || null,
        crdc_prev: CRDC_PREV[r.schoolcode] || null,
        trend: trends[r.schoolcode] || null,
        teachers_total: teachers[r.schoolcode]?.total ?? null,
        teachers_new_pct: teachers[r.schoolcode]?.newPct ?? null,
        per_pupil_spending: spending[r.schoolcode] ?? null,
      });
    } else {
      districts.push({ district: r.districtname, area, ...withoutKeys(record, ['area', 'school_type', 'grades', 'students_per_teacher']), students_per_teacher: null, district_code: d.code });
    }
  }

  log(`Done: ${schools.length} schools, ${districts.length} districts.`);
  return {
    generated: new Date().toISOString().slice(0, 10),
    school_year: year,
    notes: 'Percentages are 0-100. Strings like "<3.7" or ">95" are OSPI privacy-suppressed ranges; "N<10" means fewer than 10 students.',
    sources: {
      ...ids.years, crdc: CRDC_YEAR, crdc_prev: CRDC_PREV_YEAR, teachers: teachers.year, per_pupil_spending: spending.year,
      datasets: Object.fromEntries(Object.entries(ids).filter(([k]) => k !== 'years')),
    },
    trend_years: years,
    state,
    districts,
    schools,
  };
}

function withoutKeys(obj, keys) {
  const copy = { ...obj };
  keys.forEach((k) => delete copy[k]);
  return copy;
}

/** County layer first; the NCES directory fills schools the county layer has no point for. */
function location(loc, nces, zip) {
  if (loc) return { lat: round4(loc.LAT_CEN), lon: round4(loc.LONG_CEN), address: loc.ADDRESS ? loc.ADDRESS.trim() : null, zip };
  if (nces?.lat) return { lat: round4(nces.lat), lon: round4(nces.lon), address: nces.street, zip: nces.zip, location_source: 'NCES' };
  return { lat: null, lon: null, address: null, zip };
}

/** All pages of an Urban Institute API query. */
async function urban(path) {
  let url = `${URBAN}/${path}`;
  let rows = [];
  // Identify ourselves when running outside a browser (some APIs turn away anonymous scripts).
  const headers = typeof window === 'undefined' ? { 'User-Agent': 'south-king-schools-updater (github.com/SouthSeattleSchoolData/southkingschools)', Accept: 'application/json' } : {};
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Urban Institute API ${path}: ${res.status}`);
    const json = await res.json();
    rows = rows.concat(json.results || []);
    url = json.next;
  }
  return rows;
}

/** OSPI school code -> NCES ID, district ID and address, from the NCES Common Core of Data. */
async function loadNcesDirectory(schoolCodes) {
  const wanted = new Set(schoolCodes);
  const out = {};
  for (const year of [2024, 2023, 2022, 2021]) {
    let rows = [];
    try { rows = await urban(`schools/ccd/directory/${year}/?fips=53&county_code=53033`); } catch (err) { console.warn(`NCES directory ${year}: ${err.message}`); continue; }
    for (const r of rows) {
      const code = String(r.seasch || '').split('-')[1];
      if (wanted.has(code) && !out[code]) {
        out[code] = { id: r.ncessch, leaid: r.leaid, lat: r.latitude, lon: r.longitude, street: r.street_location, zip: r.zip_location };
      }
    }
  }
  return out;
}

/** Reading, math, attendance, discipline and enrollment for each trend year (null where a file isn't out). */
async function loadTrends(config, schoolCodes, years, log) {
  const where = `organizationlevel='School' and schoolcode in ${inList(schoolCodes)}`;
  const out = {};
  const slot = (code) => (out[code] ??= { ela: [], math: [], att: [], disc: [], n: [] });
  const pctOf = (v) => {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    if (/^n</i.test(s) || /top|bottom|suppress|no students/i.test(s)) return null;
    const m = s.match(/^([<>])\s*([\d.]+)%?$/);
    if (m) return `${m[1]}${Math.round(Number(m[2])) || 1}`;
    const f = parseFloat(s);
    if (Number.isNaN(f)) return null;
    return /%$/.test(s) || f > 1.0001 ? Math.round(f * 10) / 10 : Math.round(f * 1000) / 10;
  };
  const ids = {};
  for (const year of years) {
    ids[year] = {};
    for (const key of ['assessment', 'discipline', 'sqss', 'enrollment']) {
      ids[year][key] = config.DATASETS[year]?.[key] || await findDataset(config.DATASET_NAMES[key].replace('{year}', year));
      if (!ids[year][key]) log(`Trend: no ${key} file for ${year} yet`);
    }
  }
  const rows = (id, params) => (id ? soql(id, params) : Promise.resolve([]));
  for (const [i, year] of years.entries()) {
    const y = ids[year];
    const tests = {};
    (await rows(y.assessment, { $where: `${where} and gradelevel='All Grades' and studentgroup='All Students' and test_administration_group!='AIM'`, $select: 'schoolcode,testsubject,percent_consistent_grade,dat' }))
      .forEach((r) => { (tests[r.schoolcode] ??= {})[/math/i.test(r.testsubject) ? 'math' : /english|ela/i.test(r.testsubject) ? 'ela' : 'other'] = r.percent_consistent_grade ?? r.dat; });
    const disc = {};
    (await rows(y.discipline, { $where: `${where} and gradelevel='All' and student_group='All Students'`, $select: 'schoolcode,disciplinerate' }))
      .forEach((r) => { disc[r.schoolcode] = r.disciplinerate; });
    const measureCol = year === '2018-19' ? 'measures' : 'measure';
    const att = {};
    (await rows(y.sqss, { $where: `${where} and studentgroup='All Students' and gradelevel='All Grades' and ${measureCol}='Regular Attendance'`, $select: 'schoolcode,label,percent' }))
      .forEach((r) => { att[r.schoolcode] = r.percent ?? r.label; });
    const enr = {};
    (await rows(y.enrollment, { $where: `${where} and gradelevel='All Grades'`, $select: 'schoolcode,all_students' }))
      .forEach((r) => { enr[r.schoolcode] = Number(r.all_students); });
    for (const code of schoolCodes) {
      const t = slot(code);
      t.ela[i] = parseTrendValue(String(pctOf(tests[code]?.ela) ?? ''));
      t.math[i] = parseTrendValue(String(pctOf(tests[code]?.math) ?? ''));
      t.att[i] = parseTrendValue(String(pctOf(att[code]) ?? ''));
      t.disc[i] = parseTrendValue(String(pctOf(disc[code]) ?? ''));
      t.n[i] = enr[code] ?? null;
    }
  }
  for (const code of Object.keys(out)) if (!out[code].n.some((x) => x != null)) delete out[code];
  return out;
}

/** Share of teachers in their first five years (OSPI teacher experience file, all years in one dataset). */
async function loadTeachers(schoolCodes, year) {
  const id = 'bdjb-hg6t';
  const years = (await soql(id, { $select: 'schoolyear', $group: 'schoolyear', $order: 'schoolyear desc' })).map((r) => r.schoolyear);
  const use = years.includes(year) ? year : years[0];
  const out = { year: use };
  (await soql(id, { $where: `organizationlevel='School' and schoolyear='${use}' and schoolcode in ${inList(schoolCodes)}`, $select: 'schoolcode,experiencebin,teachercount,teachertotalcount' }))
    .forEach((r) => {
      const o = (out[r.schoolcode] ??= { all: Number(r.teachertotalcount), newT: 0, unknown: 0 });
      if (r.experiencebin === '0.0 - 4.9') o.newT = Number(r.teachercount);
      if (r.experiencebin === 'Not Reported') o.unknown = Number(r.teachercount);
    });
  for (const [code, o] of Object.entries(out)) {
    if (code === 'year') continue;
    const total = o.all - o.unknown;
    out[code] = { total, newPct: total >= 5 ? Math.round((1000 * o.newT) / total) / 10 : null };
  }
  return out;
}

/** Spending per student, all funds (OSPI per-pupil expenditure, all years in one dataset). */
async function loadSpending(schoolCodes, year) {
  const id = 'vnm3-j8pe';
  const years = (await soql(id, { $select: 'school_year_code', $group: 'school_year_code', $order: 'school_year_code desc' })).map((r) => r.school_year_code);
  const use = years.includes(year) ? year : years[0];
  const out = { year: use };
  (await soql(id, { $where: `school_year_code='${use}' and schoolcode in ${inList(schoolCodes)}`, $select: 'schoolcode,total_ppe,organization_level' }))
    .forEach((r) => { if (r.organization_level !== 'District') out[r.schoolcode] = Math.round(Number(r.total_ppe)); });
  return out;
}

/** Statewide benchmarks for the same year. */
async function loadState(ids) {
  const where = "organizationlevel='State'";
  const tests = await soql(ids.assessment, { $where: `${where} and gradelevel='All Grades' and studentgroup='All Students' and test_administration_group!='AIM'`, $select: 'testsubject,percent_consistent_grade' });
  const disc = await soql(ids.discipline, { $where: `${where} and gradelevel='All' and student_group='All Students'`, $select: 'disciplinerate' });
  const grad = await soql(ids.graduation, { $where: `${where} and studentgroup='All Students' and cohort='Four Year'`, $select: 'graduationrate' });
  const sq = await soql(ids.sqss, { $where: `${where} and studentgroup='All Students' and gradelevel='All Grades'`, $select: 'measure,label' });
  const enr = await soql(ids.enrollment, { $where: `${where} and gradelevel='All Grades'`, $select: 'all_students,low_income' });
  const test = (subject) => clean(asPercent(tests.find((t) => t.testsubject === subject)?.percent_consistent_grade));
  const measure = (m) => clean(sq.find((r) => r.measure === m)?.label);
  return {
    pct_low_income: pct(+enr[0].low_income, +enr[0].all_students),
    ela_proficient: test('ELA'),
    math_proficient: test('Math'),
    science_proficient: test('Science'),
    discipline_all: clean(disc[0]?.disciplinerate),
    grad_rate_4yr: grad[0] ? Math.round(1000 * grad[0].graduationrate) / 10 : null,
    regular_attendance: measure('Regular Attendance'),
    ninth_grade_on_track: measure('Ninth Grade on Track'),
    dual_credit: measure('Dual Credit'),
  };
}

/** Same layout as the checked-in file: one school per line, so diffs stay readable. */
export function formatJson(data) {
  const line = (o) => JSON.stringify(o);
  return `{\n"generated": ${line(data.generated)},\n"school_year": ${line(data.school_year)},\n"notes": ${line(data.notes)},\n"sources": ${line(data.sources || {})},\n"trend_years": ${line(data.trend_years || [])},\n"state": ${line(data.state)},\n"districts": [\n${data.districts.map(line).join(',\n')}\n],\n"schools": [\n${data.schools.map(line).join(',\n')}\n]\n}\n`;
}

/** Sanity checks on a built file. If OSPI changes a file format, stop rather than publish nonsense. */
export function checkData(data) {
  const problems = [];
  const nums = (key) => data.schools.map((s) => s[key]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const median = (v) => v[Math.floor(v.length / 2)];
  if (data.schools.length < 150) problems.push(`only ${data.schools.length} schools`);
  if (data.schools.filter((s) => s.crdc).length < 150) problems.push('federal civil rights data is missing for most schools');
  for (const key of ['ela_proficient', 'math_proficient', 'regular_attendance', 'pct_low_income']) {
    const v = nums(key);
    if (v.length < 100) problems.push(`${key}: only ${v.length} schools have a value`);
    else if (median(v) < 5 || median(v) > 100) problems.push(`${key}: median ${median(v)} looks like the wrong scale`);
  }
  for (const key of ['ela_proficient', 'math_proficient']) {
    const v = data.state[key];
    if (typeof v !== 'number' || v < 5 || v > 100) problems.push(`state ${key} is ${v}`);
  }
  return problems;
}

/**
 * Fills a new build with values it couldn't fetch this time, from the previous file:
 * federal records, NCES IDs and addresses, and lead testing.
 * Returns how many schools needed each.
 */
export function carryOver(data, old) {
  const before = Object.fromEntries((old.schools || []).map((s) => [s.code, s]));
  const kept = { crdc: 0, nces_id: 0, location: 0, lead: 0 };
  for (const s of data.schools) {
    const prev = before[s.code];
    if (!prev) continue;
    if (!s.crdc && prev.crdc && prev.crdc.year === data.sources?.crdc) { s.crdc = prev.crdc; kept.crdc++; }
    if (!s.nces_id && prev.nces_id) { s.nces_id = prev.nces_id; kept.nces_id++; }
    if (s.lat == null && prev.lat != null) {
      Object.assign(s, { lat: prev.lat, lon: prev.lon, address: prev.address, zip: prev.zip || s.zip, location_source: prev.location_source || 'previous' });
      kept.location++;
    }
    if (!s.lead && prev.lead) { s.lead = prev.lead; kept.lead++; }
  }
  if (old.sources?.lead) data.sources = { ...data.sources, lead: old.sources.lead };
  return kept;
}
