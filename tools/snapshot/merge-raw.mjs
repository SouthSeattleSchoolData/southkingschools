// One-time merge of the data snapshots in tools/raw/ into data/schools.json.
// The GitHub Action (tools/build-data.js) pulls the same data straight from the APIs;
// this script exists so the checked-in file has it before the first automatic run.
//
//   node tools/snapshot/merge-raw.mjs
//
// Sources (pulled 17 Nov 2026, each checked against the live API by checksum):
//   crdc_2023_24.csv, crdc_2021_22.csv  federal CRDC extracts (see build-crdc.mjs)
//   nces_directory.txt     Urban Institute, NCES Common Core of Data directory 2022 (IDs, addresses)
//   trends_2019_2025.txt   OSPI Report Card files on data.wa.gov, 2018-19 and 2021-22 to 2024-25
//   teachers_2024_25.txt   OSPI Report Card Teacher Experience Distribution (bdjb-hg6t), 2024-25
//   ppe_2024_25.txt        OSPI Per Pupil Expenditure (vnm3-j8pe), 2024-25
//   lead_doh.txt           WA Department of Health lead-in-school-water results since 2022

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatJson } from '../build-data.js';
import { TREND_YEARS, parseTrendValue, leadMatchKey } from '../shared.js';
import { CRDC, CRDC_PREV, CRDC_YEAR, CRDC_PREV_YEAR } from '../crdc-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = (f) => readFileSync(join(root, 'tools/raw', f), 'utf8').trim();
const data = JSON.parse(readFileSync(join(root, 'data/schools.json'), 'utf8'));

// ---- CRDC: built from tools/raw/crdc_*.csv by build-crdc.mjs ----

// ---- NCES directory: IDs, virtual flag, addresses for schools the county layer lacks ----
const nces = {};
for (const line of raw('nces_directory.txt').split('\n')) {
  const [code, id, virtual, lat, lon, street, zip] = line.split('|');
  nces[code] = { id, virtual: Number(virtual), lat: lat ? Number(lat) : null, lon: lon ? Number(lon) : null, street, zip };
}

// ---- Trends ----
const trends = {};
for (const line of raw('trends_2019_2025.txt').split('\n')) {
  const [code, rest] = line.split(':');
  const years = rest.split(';');
  const t = { ela: [], math: [], att: [], disc: [], n: [] };
  TREND_YEARS.forEach((_, i) => {
    const [ela, math, att, disc, n] = (years[i] || '').split(',');
    t.ela.push(parseTrendValue(ela));
    t.math.push(parseTrendValue(math));
    t.att.push(parseTrendValue(att));
    t.disc.push(parseTrendValue(disc));
    t.n.push(n ? Number(n) : null);
  });
  trends[code] = t;
}

// ---- Teachers and spending ----
const teachers = Object.fromEntries(raw('teachers_2024_25.txt').split(';').map((p) => {
  const [code, frac] = p.split(':');
  const [newT, total] = frac.split('/').map(Number);
  return [code, { new: newT, total }];
}));
const ppe = Object.fromEntries(raw('ppe_2024_25.txt').split(';').map((p) => p.split(':')).map(([c, v]) => [c, Number(v)]));

// ---- Lead testing (matched by name within district) ----
// Department of Health names that differ from OSPI's beyond "School"/punctuation.
const LEAD_ALIASES = {
  'Cleveland High School': 'Cleveland High School STEM',
  'Denny International Middle School': 'David T. Denny International Middle',
  "Dearborn Park Intl'l Elementary School": 'Dearborn Park International',
  "Beacon Hill Int'l Elementary School": 'Beacon Hill International',
  'Cooper (Pathfinder) Elementary School': 'Pathfinder K-8',
  'Roxhill Elementary (at former Hughes ES)': 'Roxhill Elementary',
};
const lead = {};
if (existsSync(join(root, 'tools/raw/lead_doh.txt'))) {
  for (const line of raw('lead_doh.txt').split('\n')) {
    const [name, district, tested, over5, over15, retests, retestsOver5, last] = line.split('|');
    lead[leadMatchKey(LEAD_ALIASES[name] || name, district)] = {
      tested: +tested, over5: +over5, over15: +over15, retests: +retests, retests_over5: +retestsOver5, last,
    };
  }
}

let filled = 0;
let leadHits = 0;
for (const s of data.schools) {
  const n = nces[s.code];
  if (n) {
    s.nces_id = n.id;
    if (s.lat == null && n.lat != null) {
      Object.assign(s, { lat: n.lat, lon: n.lon, address: titleCase(n.street), zip: n.zip, location_source: 'NCES' });
      filled++;
    }
  }
  delete s.crdc_2017_18;
  s.crdc = CRDC[s.code] || null;
  s.crdc_prev = CRDC_PREV[s.code] || null;
  s.trend = trends[s.code] || null;
  const t = teachers[s.code];
  s.teachers_total = t ? t.total : null;
  s.teachers_new_pct = t && t.total >= 5 ? Math.round((1000 * t.new) / t.total) / 10 : null;
  s.per_pupil_spending = ppe[s.code] ?? null;
  const l = lead[leadMatchKey(s.name, s.district)];
  s.lead = l || null;
  if (l) leadHits++;
}

data.trend_years = TREND_YEARS;
const ospi = Object.fromEntries(['enrollment', 'assessment', 'discipline', 'graduation', 'sqss', 'growth', 'wakids'].map((k) => [k, data.school_year]));
data.sources = {
  ...ospi,
  ...(data.sources || {}),
  crdc: CRDC_YEAR,
  crdc_prev: CRDC_PREV_YEAR,
  teachers: '2024-25',
  per_pupil_spending: '2024-25',
  lead: 'WA Department of Health, tests since 2022',
};
writeFileSync(join(root, 'data/schools.json'), formatJson(data));
console.log(`Merged: ${Object.keys(CRDC).length} CRDC, ${Object.keys(trends).length} trends, ${filled} locations filled, ${leadHits} lead matches.`);

function titleCase(s) {
  return s ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Se|Sw|Ne|Nw|N|S|E|W)\b/gi, (m) => m.toUpperCase()) : s;
}
