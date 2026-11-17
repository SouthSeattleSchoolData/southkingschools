// Builds one plain HTML page per school (school/<code>.html), plus sitemap.xml and robots.txt,
// so search engines can find each school. The interactive app stays the main experience;
// each page links into it.
//
//   node tools/build-pages.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SITE_URL } from './config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data/schools.json'), 'utf8'));

// The app's own logic for levels and scores, so pages and app agree.
const dataModule = await import('../js/data.js');
const { computeScores } = await import('../js/scores.js');
const { trendChange, perStaff } = await import('../js/metrics.js');
const schools = data.schools.map((s) => dataModule.prepareSchool(s));
computeScores(schools);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (v, unit = '%') => (v == null || v === '' ? '—' : typeof v === 'number' ? `${Math.round(v * 10) / 10}${unit}` : /^n</i.test(v) ? 'fewer than 10 students' : `${v}${unit}`);
const districtName = (s) => (s.is_charter ? 'Charter school' : s.district === 'Seattle School District No. 1' ? 'Seattle Public Schools' : s.district);

function description(s) {
  const bits = [`${s.name} (${districtName(s)}, grades ${s.grades}, ${s.enrollment.toLocaleString('en-US')} students).`];
  if (s.ela_proficient != null) bits.push(`Reading ${show(s.ela_proficient)}, math ${show(s.math_proficient)} meeting standard.`);
  if (s.regular_attendance != null) bits.push(`Regular attendance ${show(s.regular_attendance)}.`);
  bits.push('Trends, discipline, safety incidents, counselors and lead testing.');
  return bits.join(' ');
}

function page(s) {
  const url = `${SITE_URL}school/${s.code}.html`;
  const app = `../#s-${s.code}`;
  const rows = [
    ['Reading proficiency', show(s.ela_proficient)],
    ['Math proficiency', show(s.math_proficient)],
    ['Science proficiency', show(s.science_proficient)],
    ['Regular attendance', show(s.regular_attendance)],
    ['4-year graduation', show(s.grad_rate_4yr)],
    ['Suspended or expelled', show(s.discipline?.all)],
    ['Low-income students', show(s.pct_low_income)],
    ['English learners', show(s.pct_english_learners)],
    ['Students with disabilities', show(s.pct_disability)],
    ['Teachers in their first 5 years', show(s.teachers_new_pct)],
    ['Spending per student', s.per_pupil_spending ? `$${s.per_pupil_spending.toLocaleString('en-US')}` : '—'],
  ].filter(([, v]) => v !== '—');
  const change = ['ela', 'math'].map((k) => [k, trendChange(s, k)]).filter(([, v]) => v != null)
    .map(([k, v]) => `${k === 'ela' ? 'Reading' : 'Math'} ${v >= 0 ? 'up' : 'down'} ${Math.abs(v)} points since 2018-19`).join('; ');
  const counselor = perStaff(s, 'counselors');
  const scores = s.scores ? Object.entries({ Academics: s.scores.academics, Growth: s.scores.growth, Equity: s.scores.equity, Climate: s.scores.climate })
    .filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(', ') : '';
  const ld = {
    '@context': 'https://schema.org',
    '@type': s.level === 'High' ? 'HighSchool' : s.level === 'Middle' ? 'MiddleSchool' : s.level === 'Elementary' ? 'ElementarySchool' : 'School',
    name: s.name,
    url,
    ...(s.address ? { address: { '@type': 'PostalAddress', streetAddress: s.address, postalCode: s.zip, addressRegion: 'WA', addressCountry: 'US' } } : {}),
    ...(s.lat ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon } } : {}),
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(s.name)} | South King Schools</title>
  <meta name="description" content="${esc(description(s))}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(s.name)} | South King Schools">
  <meta property="og:description" content="${esc(description(s))}">
  <meta property="og:image" content="${SITE_URL}og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="../css/fonts.css">
  <link rel="stylesheet" href="../css/styles.css">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
  <main class="static-school">
    <div class="wrap" style="padding:28px 20px 60px;max-width:760px">
      <p class="small"><a href="../#home">South King Schools</a> / <a href="../#find">${esc(s.area)}</a></p>
      <h1>${esc(s.name)}</h1>
      <p class="lede">${esc(districtName(s))}, grades ${esc(s.grades)}, ${s.enrollment.toLocaleString('en-US')} students${s.address ? `. ${esc(s.address)}, ${esc(s.zip)}` : ''}.</p>
      <p><a class="btn" href="${app}" style="text-decoration:none">Open the full interactive profile</a></p>
      ${scores ? `<p class="small">Scores compared with same-level schools in these six areas (0–100): ${esc(scores)}.</p>` : ''}
      <h2 class="sec">Key numbers, ${esc(data.school_year)}</h2>
      <table class="tbl"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${esc(v)}</td></tr>`).join('')}</tbody></table>
      ${change ? `<p class="small" style="margin-top:14px">${esc(change)}.</p>` : ''}
      ${s.crdc ? `<h2 class="sec">Safety and support, ${s.crdc.year}</h2>
      <p class="small">Federal Civil Rights Data Collection: ${s.crdc.attacks ?? 0} physical attacks or fights, ${s.crdc.threats ?? 0} threats, ${s.crdc.firearm_possession ?? 0} firearm possession incidents, ${s.crdc.harassment_allegations ?? 0} bullying or harassment allegations. ${typeof counselor === 'number' ? `One counselor per ${counselor} students.` : counselor === 'none' ? 'No counselor reported.' : ''}</p>` : ''}
      ${s.lead ? `<h2 class="sec">Lead in drinking water</h2><p class="small">Department of Health sampled ${s.lead.tested} outlets (latest ${esc(s.lead.last)}); ${s.lead.over5} tested above 5 ppb.</p>` : ''}
      <p class="xs muted" style="margin-top:30px">Public data from OSPI, the U.S. Department of Education, NCES and the WA Department of Health. See <a href="../#method">how it works</a>.</p>
    </div>
  </main>
</body>
</html>
`;
}

rmSync(join(root, 'school'), { recursive: true, force: true });
mkdirSync(join(root, 'school'));
for (const s of schools) writeFileSync(join(root, 'school', `${s.code}.html`), page(s));

const today = data.generated;
const urls = [`${SITE_URL}`, ...schools.map((s) => `${SITE_URL}school/${s.code}.html`)];
writeFileSync(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(root, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
console.log(`Wrote ${schools.length} school pages, sitemap.xml and robots.txt for ${SITE_URL}`);
