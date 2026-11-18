# South King Schools

A public-data guide to the 187 public and charter schools in Renton, Kent, Maple Valley, Issaquah, Bellevue, West Seattle and South Seattle.

Live site: https://southseattleschooldata.github.io/southkingschools/

It's a static site: plain HTML, CSS and JavaScript with no build step and no server. GitHub Pages serves the files as they are.

## What's where

```
index.html              Page markup for every view (home, find, school, compare, findings, safety, how it works)
css/styles.css          All styling. Colors are CSS variables at the top; light and dark themes swap them.
js/main.js              Starts the app: loads data, theme toggle, page routing (#home, #find, #s-<code>, ...)
js/data.js              Loads the JSON files, adds school level/tags
js/metrics.js           Every measure the site shows: label, unit, where it lives in the data
js/scores.js            The four 0-100 scores (Academics, Growth, Equity, Climate) and the income trend line
js/insights.js          "Reading this school" notes and tour questions (rules with named thresholds)
js/geo.js               Distances, address/ZIP lookup, "use my location"
js/maps.js              Street maps (Leaflet + OpenStreetMap), with a plain dot plot fallback
js/charts.js            Small SVG charts
js/components.js        Shared bits of markup (score bars, tags)
js/compare-list.js      The compare list, saved in the visitor's browser
js/trends.js            Year-over-year medians, recovery since 2018-19, small-school cautions
js/i18n.js              Interface translation (Español, Tiếng Việt, 中文)
js/feedback.js          "Report a mistake" links
js/views/*.js           One file per page
data/schools.json       School and district data (generated, see below)
content/news.json       Incident timeline on the Safety page (hand-edited)
content/policies.json   District security approaches (hand-edited)
content/meta.json       Discipline trend, Healthy Youth Survey table, district risk and poverty, feedback and analytics settings (hand-edited)
content/glossary.json   Definitions shown in the ⓘ tips and on the Glossary page
content/i18n.json       Interface translations, keyed by the English text
school/<code>.html      One plain page per school for search engines (generated)
sitemap.xml, robots.txt Search-engine files (generated)
og-image.png            Preview image when the site is shared
tools/update-data.html  One-click data updater (in the browser)
tools/update-data.mjs   Command-line updater, used by the GitHub Action
tools/build-data.js     What both updaters do
tools/build-pages.mjs   Builds school/*.html, sitemap.xml and robots.txt
tools/config.js         Which districts/schools are included, Seattle ZIPs, manual school locations, site address
tools/raw/              Snapshots of extra sources merged on 17 Nov 2026 (see tools/snapshot/merge-raw.mjs)
tests/                  Automated QA suite and the latest QA report
.github/workflows/      The automatic data update
vendor/leaflet/         Map library (Leaflet 1.9.4, BSD-2 license)
```

## Updating the school data

### Automatically (recommended)

The GitHub Action in `.github/workflows/update-data.yml` rebuilds the data on the 1st and 15th of every month, saves it, rebuilds the school pages and republishes the site. It picks the newest school year OSPI has published; files that come out later (discipline, graduation) use the previous year until they appear. If anything looks wrong (for example OSPI changes a file format), it stops without saving.

To run it now: GitHub → **Actions** → **Update school data** → **Run workflow**.

If the Actions tab says workflows are disabled, click **I understand my workflows, go ahead and enable them**. Under **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions** so it can save the new data.

### By hand

OSPI publishes each school year's Report Card files on data.wa.gov in the fall.

1. Open `https://southseattleschooldata.github.io/southkingschools/tools/update-data.html`.
2. Enter the school year (for example `2025-26`) and click **Build data**. It takes about a minute.
3. Check the summary (school counts by area, schools without a map location), then click **Download schools.json**.
4. Replace `data/schools.json` in this repository with the downloaded file and commit.

If the updater says it can't find a dataset, look up the year's file IDs on data.wa.gov (search "Report Card Enrollment 2025-26") and add them under `DATASETS` in `tools/config.js`.

A new school with no map dot? Add its location to `MANUAL_LOCATIONS` in `tools/config.js` and run the updater again.

Also review by hand each year:
- `content/meta.json`: add the new year's discipline rates to `discipline_trend`; update the Healthy Youth Survey table after each survey (odd years).
- `content/news.json`: add or remove incidents.
- `content/policies.json`: district security changes.

## Optional settings

- **Corrections**: "Report a mistake" links open a GitHub issue, which needs a free GitHub account. To accept reports from anyone, make a Google Form and paste its link into `feedback.form_url` in `content/meta.json` (or an email address into `feedback.email`).
- **Visit counts**: create a free account at goatcounter.com, then put your site code (the part before `.goatcounter.com`) in `analytics.goatcounter` in `content/meta.json`. It uses no cookies and records only which page type was viewed, never addresses typed into the search box.
- **Custom domain** (for example `southkingschools.org`, about $12 a year from any registrar): in the repository go to **Settings → Pages → Custom domain**, enter the domain and save; GitHub shows the DNS records to add at your registrar. Then change `SITE_URL` in `tools/config.js` and the `og:url`, `og:image` and canonical links at the top of `index.html`, and run the workflow so the school pages and sitemap use the new address.
- **Search engines**: after the first update, submit `sitemap.xml` in Google Search Console (free) so the school pages get indexed sooner.

## Translations

The interface (menus, buttons, headings, measure names, chart labels) is available in Español, Tiếng Việt and 中文 from the menu at the top. Explanations, notes and sources stay in English, and a banner says so. Translations live in `content/i18n.json`, keyed by the exact English text; they were drafted with machine assistance and would benefit from review by native speakers. To add a language, add its code to `languages` and a translation to each string.

## Editing text

- Page wording and the "How it works" explanation: `index.html`.
- Interpretation rules and their thresholds: the `T` object at the top of `js/insights.js`.
- How scores are calculated: `js/scores.js` (and update "How it works" in `index.html` to match).

## Previewing locally

The site loads its data with `fetch`, which browsers block for files opened directly from disk. From this folder run:

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Data sources

- OSPI Report Card files on data.wa.gov: enrollment, assessment (Smarter Balanced and WCAS; WA-AIM excluded), discipline, graduation, SQSS (attendance, 9th grade on track, dual credit), growth, WaKIDS, student–teacher ratio.
- U.S. Department of Education Civil Rights Data Collection 2023-24 (from civilrightsdata.ed.gov) and 2021-22 for comparison, checked in as `tools/crdc-data.js`. The CRDC comes out every two years, so the automatic update doesn't fetch it; when 2025-26 is released, add its extract to `tools/raw/` and run `node tools/snapshot/build-crdc.mjs`. To add a district: put it in `tools/config.js`, run the "Snapshot federal data" Action with the district's name, then `tools/snapshot/crdc_extract.py` (see its header) and `build-crdc.mjs`.
- NCES school directory, via the Urban Institute Education Data Portal API.
- Feeder patterns (`content/feeders.json`, edited by hand): Issaquah and Bellevue district feeder lists; Renton's boundary maps and Seattle's 2025-26 attendance-area GIS, compared area by area. Tahoma has one high school; its middle school depends on home address. Update when a district redraws boundaries. Kent publishes boundaries only through its address lookup, so Kent schools link there.
- OSPI teacher experience and per-pupil expenditure; trends from OSPI files for 2018-19 and 2021-22 onward.
- WA Department of Health lead-in-school-water results; WA DSHS Community Risk Profiles; Census SAIPE child poverty.
- King County school sites layer (SCHSITE_POINT_107).
- Healthy Youth Survey 2025 (state results; Seattle Public Schools' published district report).
- Maps: © OpenStreetMap contributors. OpenStreetMap's tile servers are meant for light use; if traffic grows, switch `TILE_URL` in `js/maps.js` to a provider with a free tier.
- Address search: OpenStreetMap Nominatim.

Not affiliated with OSPI, King County or any school district.

## Quality checks

`tests/qa_suite.py` runs 31 automated checks (features, input safety, WCAG 2.2 AA accessibility, phone layouts, failure handling, data integrity). Results and the latest report are in `tests/QA-REPORT.md`.

Fonts are self-hosted in `vendor/fonts` (SIL Open Font License), so the site makes no requests to Google.
