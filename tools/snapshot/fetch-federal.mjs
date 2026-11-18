// Pulls the raw federal Civil Rights Data Collection rows (and OSPI enrollment for the CRDC years)
// for the districts on this site, so a new district's extract can be added to tools/raw/.
// Runs in the "Snapshot federal data" GitHub Action, which saves the output on the `snapshot` branch.
//
//   node tools/snapshot/fetch-federal.mjs "Tahoma"     # also include districts whose name matches
//
// Output (snapshot/): crdc-<year>/<file>.csv with only Washington rows for our districts,
// crdc-files.txt (every file and its columns) and enrollment_crdc_years.json.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, basename } from 'node:path';

const match = new RegExp(process.argv[2] || '^$', 'i');
const data = JSON.parse(readFileSync('data/schools.json', 'utf8'));
const leaids = new Set(data.schools.map((s) => s.nces_id?.slice(0, 7)).filter(Boolean));
const out = 'snapshot';
mkdirSync(out, { recursive: true });
const log = (m) => console.log(m);

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
  }
  cells.push(cur);
  return cells;
}

async function zipLinks() {
  const links = new Set([
    'https://civilrightsdata.ed.gov/assets/ocr/docs/2023-24-crdc-data.zip',
    'https://civilrightsdata.ed.gov/assets/ocr/docs/2021-22-crdc-data.zip',
  ]);
  try {
    const html = await (await fetch('https://civilrightsdata.ed.gov/data')).text();
    for (const src of html.match(/src="[^"]+\.js"/g) || []) {
      const url = new URL(src.slice(5, -1), 'https://civilrightsdata.ed.gov/').href;
      const js = await (await fetch(url)).text();
      for (const z of js.match(/[\w/.:-]*20(21-22|23-24)[\w/.-]*\.zip/gi) || []) links.add(new URL(z, 'https://civilrightsdata.ed.gov/').href);
    }
  } catch (err) { log(`Couldn't read the data page: ${err.message}`); }
  log(`Zip candidates:\n  ${[...links].join('\n  ')}`);
  return [...links];
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const fileList = [];
const done = new Set();
for (const url of await zipLinks()) {
  const year = /20(21-22|23-24)/.exec(url)?.[0];
  if (!year || done.has(year)) continue;
  const zip = `/tmp/crdc-${year}.zip`;
  try {
    execFileSync('curl', ['-sSfL', '--retry', '3', '-o', zip, url], { stdio: 'inherit' });
  } catch { log(`Download failed: ${url}`); continue; }
  const dir = `/tmp/crdc-${year}`;
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  done.add(year);
  log(`${year}: ${url}`);
  const yearOut = join(out, `crdc-${year}`);
  mkdirSync(yearOut, { recursive: true });
  for (const file of walk(dir).filter((f) => /\.csv$/i.test(f))) {
    const rl = createInterface({ input: createReadStream(file, { encoding: 'latin1' }), crlfDelay: Infinity });
    let head = null;
    let iLea; let iState; let iName;
    let kept = 0;
    const lines = [];
    for await (const line of rl) {
      if (!head) {
        head = parseCsvLine(line.replace(/^﻿|^ï»¿/, ''));
        iLea = head.indexOf('LEAID'); iState = head.indexOf('LEA_STATE'); iName = head.indexOf('LEA_NAME');
        fileList.push(`${year} ${basename(file)}: ${head.join(',')}`);
        if (iLea < 0) break;
        lines.push(line);
        continue;
      }
      if (!line.includes('WA')) continue;
      const c = parseCsvLine(line);
      if (c[iState] !== 'WA') continue;
      if (leaids.has(c[iLea]) || match.test(c[iName] || '')) { lines.push(line); kept++; }
    }
    if (kept) writeFileSync(join(yearOut, basename(file)), lines.join('\n') + '\n');
    log(`  ${basename(file)}: ${kept} rows`);
  }
}
writeFileSync(join(out, 'crdc-files.txt'), fileList.join('\n') + '\n');

// OSPI enrollment for each CRDC year, for every district on the site plus the matched one
const SOCRATA = 'https://data.wa.gov/resource';
const enrollment = {};
for (const [year, id] of [['2021-22', 'ymi4-syjv'], ['2023-24', 'q4ba-s3jc']]) {
  const where = `gradelevel='All Grades' and organizationlevel='School' and (districtname like '%${(process.argv[2] || 'zzzz').replace(/'/g, '')}%')`;
  const res = await fetch(`${SOCRATA}/${id}.json?$limit=5000&$select=districtname,schoolcode,schoolname,all_students&$where=${encodeURIComponent(where)}`);
  enrollment[year] = res.ok ? await res.json() : { error: res.status };
  log(`Enrollment ${year}: ${Array.isArray(enrollment[year]) ? enrollment[year].length : 'error'} rows`);
}
writeFileSync(join(out, 'enrollment_crdc_years.json'), JSON.stringify(enrollment, null, 1));
