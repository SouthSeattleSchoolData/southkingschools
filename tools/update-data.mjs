// Command-line updater, used by the GitHub Action (.github/workflows/update-data.yml).
// Finds the newest school year OSPI has published, rebuilds data/schools.json, keeps the
// lead-testing results (which come from a separate, manual source), then rebuilds the
// per-school pages and sitemap.
//
//   node tools/update-data.mjs            # newest year available
//   node tools/update-data.mjs 2025-26    # a specific year

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as config from './config.js';
import { buildData, formatJson, previousYear, checkData, carryOver } from './build-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'data/schools.json');
const old = JSON.parse(readFileSync(file, 'utf8'));
const log = (m) => console.log(m);

async function hasTestScores(year) {
  const name = config.DATASET_NAMES.assessment.replace('{year}', year);
  const res = await fetch(`https://data.wa.gov/api/catalog/v1?domains=data.wa.gov&only=datasets&limit=10&q=${encodeURIComponent(name)}`);
  const hits = (await res.json()).results || [];
  return hits.some((h) => h.resource.name.trim().toLowerCase() === name.toLowerCase());
}

async function newestYear() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  let year = `${start}-${String(start + 1).slice(2)}`;
  for (let i = 0; i < 3; i++, year = previousYear(year)) if (await hasTestScores(year)) return year;
  throw new Error('No recent OSPI assessment file found.');
}

const year = process.argv[2] || await newestYear();
log(`Building ${year} (currently ${old.school_year})`);
const data = await buildData(year, config, log);

// Keep values this build doesn't fetch (lead testing) or couldn't reach this time (federal data).
const kept = carryOver(data, old);
log(`Kept from the previous file: ${Object.entries(kept).map(([k, n]) => `${k} ${n}`).join(', ')}`);

const problems = checkData(data);
if (problems.length) {
  console.error(`Not saving: ${problems.join('; ')}. The existing data stays in place.`);
  process.exit(1);
}

writeFileSync(file, formatJson(data));
log(`Wrote ${data.schools.length} schools to data/schools.json`);
execFileSync(process.execPath, [join(root, 'tools/build-pages.mjs')], { stdio: 'inherit' });
