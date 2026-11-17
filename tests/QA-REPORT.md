# QA test completion report: South King Schools

**Date:** 17 Nov 2026
**Build tested:** the files in this repository, served locally
**Result:** 39 of 39 automated test cases pass, with no open defects at Major or above (second round, after adding trends, federal 2021-22 data, lead testing, translations, search pages and automatic updates)

## Standards used

No single body certifies a website. These are the widely used references, and this report follows them:

| Standard | Published by | How it is used here |
|---|---|---|
| ISTQB test process (Foundation Level v4.0) | International Software Testing Qualifications Board | Plan, design, run, log defects, re-test, report |
| ISO/IEC/IEEE 29119-3 | ISO/IEC/IEEE | Shape of this report and the test case IDs |
| ISO/IEC 25010 | ISO/IEC | Quality characteristics used to group the tests |
| WCAG 2.2, level AA | W3C | Accessibility checks: axe-core, keyboard, reflow, text spacing |
| OWASP input validation and output encoding guidance | OWASP | Text box filtering, escaping, tampered input |

## Scope

- **In scope:** all eight pages, all 177 school profiles, search, filters, compare, location sorting, the map and its fallback, charts, glossary tips, theme, phone and desktop layouts, and the data file.
- **Out of scope:** real Safari and Firefox engines, because they can't be installed in the test environment. Live third-party services (OpenStreetMap tiles and address lookup) are replaced by stand-ins so results repeat.

## Test results

| ID | ISO 25010 characteristic | Test | Result |
|---|---|---|---|
| F01 | Functional suitability | Every page loads with a heading and no script errors (desktop + phone) | Pass |
| F02 | Functional suitability | All 177 school profiles render | Pass |
| F03 | Functional suitability | Home search suggests schools; punctuation and word order don't matter | Pass |
| F04 | Functional suitability | Find: name filter, area filter, clearing, "1 school" wording | Pass |
| F05 | Functional suitability | Compare: up to 4, refuses a 5th, survives reload, remove | Pass |
| F06 | Functional suitability | "Use my location" sorts by distance | Pass |
| F07 | Functional suitability | ZIP and street address lookups | Pass |
| F08 | Functional suitability | Theme toggle is remembered | Pass |
| F09 | Functional suitability | Findings charts: x and y axis titles, one legend | Pass |
| F10 | Functional suitability | Every ⓘ has a definition | Pass |
| S01 | Security | Script/HTML typed in either box is filtered and never runs | Pass |
| S02 | Security | Pasted special characters are filtered, and a hint shows | Pass |
| S03 | Security | Name and address characters are kept (`' - . , & # / :` and accented letters) | Pass |
| S04 | Security | Text boxes stop at 100 characters | Pass |
| S05 | Security | Tampered browser storage and URLs don't break the site | Pass |
| S06 | Security | New-tab links use `rel="noopener"` | Pass |
| A01 | Accessibility | axe-core WCAG 2.2 AA: 11 page states × light and dark, 0 violations | Pass |
| A02 | Accessibility | Keyboard focus is visible | Pass |
| A03 | Accessibility | Reflow at 320 px, no sideways scrolling (WCAG 1.4.10) | Pass |
| A04 | Accessibility | Text spacing override (WCAG 1.4.12) | Pass |
| A05 | Accessibility | Respects "reduce motion" | Pass |
| A06 | Accessibility | Keyboard only: search, open a school, add to compare | Pass |
| C01 | Compatibility | No overflow at 375, 768, 1024 and 1440 px | Pass |
| R01 | Reliability | Data file fails → clear message | Pass |
| R02 | Reliability | Map tiles fail → fallback plot still shows schools | Pass |
| R03 | Reliability | Address service down → helpful message | Pass |
| R04 | Reliability | Works with browser storage blocked | Pass |
| D01 | Data correctness | 177 schools, unique IDs, 6 areas, values 0–100, locations inside the area | Pass |
| M01 | Maintainability | HTML validates (html-validate, recommended rules) | Pass |
| M02 | Maintainability | All JavaScript parses; no leftover debug code | Pass |
| P01 | Performance | 617 KB total, interactive in about 0.3 s locally | Pass |

### Lighthouse (Google), home page

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Phone | 100 | 100 | 96* | 100 |
| Desktop | 99 | 100 | 96* | 100 |

\* The 4 points are lost only because the test machine can't reach OpenStreetMap, so the browser logs failed tile requests. The live site doesn't have this problem.

Phone metrics: first paint 1.2 s, largest paint 1.2 s, blocking time 30 ms, layout shift 0.

## Defects found and fixed

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | Major | Text boxes accepted any character | Typed or pasted characters outside letters, numbers and `' - . , & # / :` are removed as entered; 100-character cap; a short hint explains it |
| 2 | Major | Light-theme grey text failed contrast (4.1:1, needs 4.5:1), 22+ places | Darkened the muted text color to 5.3:1 |
| 3 | Major | Phone layout scrolled sideways at 320 px on Home, Findings and Compare | Fixed grid sizing, map margin, and long labels now wrap |
| 4 | Major | Mobile Lighthouse performance was 82 (largest paint 4.8 s) because pages stayed hidden until the data loaded | Page text now shows immediately; fonts are self-hosted, so nothing goes to Google |
| 5 | Minor | Result cards were fake links holding buttons, so screen readers read them wrong | The school name is now a real link; clicking the card still works |
| 6 | Minor | The List/Map/Table switch used the wrong accessibility role | Now a labeled button group with pressed state |
| 7 | Minor | The hero map was hidden from screen readers but still keyboard-focusable | Now a labeled map region |
| 8 | Minor | Search box focus was only a 1 px color change | Added a clear focus ring |
| 9 | Minor | Searching "summit atlas" or "impact salish" found nothing because of punctuation in names | Matches words in any order and ignores punctuation |
| 10 | Minor | Footer jumped as the page loaded (layout shift 0.17) | Space is reserved while loading; shift is now 0 |
| 11 | Minor | Results said "1 schools" | Now says "1 school" |
| 12 | Trivial | A broken saved compare list or theme value could cause errors; an error message wasn't escaped | Saved values are validated; the message is escaped |
| 13 | Trivial | No favicon (404 in console) | Added one |

## Known limitations (accepted)

- **13 schools have no map location.** King County's school-sites file lists no address for them (online, district-wide and shared-site programs, for example Bellevue Digital Discovery, Kent Virtual Academy and Meadow Crest Early Childhood). Their profiles now say so, and they sort last by distance.
- **Not tested on real Safari or Firefox engines.** Check the live site once on an iPhone and in Firefox: search, open a school, add to compare, and the map.
- **Data accuracy against the live state source** was checked earlier (177 of 177 schools matched the updater output). Re-run `tools/update-data.html` each school year.


## Second round: new data and features (17 Nov 2026)

### What was added and how it was tested

| ID | Test | Result |
|---|---|---|
| F11 | Profile shows four trend charts with x and y axis titles; small-school caution appears where due | Pass |
| F12 | Findings recovery chart shows all six areas; level filter works | Pass |
| F13 | Safety page incident, restraint, staffing, lead and district-risk tables are filled | Pass |
| F14 | Language menu translates the interface, is remembered after reload, switches back cleanly | Pass |
| F15 | 177 search-engine pages, sitemap with 178 entries, valid HTML, link into the app | Pass |
| S07 | "Report a mistake" links are URL-encoded from school names | Pass |
| M03 | Updater refuses data in the wrong scale (guards against OSPI format changes) | Pass |
| D02 | Merged federal, trend and lead data are internally consistent | Pass |
| A01 | axe-core WCAG 2.2 AA now covers 13 page states, including a high school profile and the Spanish interface | Pass |

### How the new data was verified

- Every snapshot moved from the live APIs into `tools/raw/` was checked against the source with a checksum computed on both ends (CRDC 2021-22, NCES directory, trends 2018-19 to 2024-25, teacher experience, spending).
- The automatic updater (`tools/build-data.js`) was run end to end against the live APIs for 2025-26 in a real browser, with its source verified by checksum. It returned 177 schools, all 5 districts, CRDC for 172 schools and trends for all 177.

### Defects found and fixed in this round

| # | Severity | Defect | Fix |
|---|---|---|---|
| 14 | Critical | OSPI's 2025-26 test files report proficiency as a fraction (0.689) instead of text ("68.9%"), and the 2025-26 kindergarten file has no school codes. The automatic update would have shown 0.7% proficiency and no kindergarten data. | Values are converted to percentages; schools are matched by organization ID; the updater now checks scales before saving and stops if anything looks wrong |
| 15 | Major | A glossary note said reading recovered faster than math; the data shows the opposite (median −8.8 vs −7.3 points) | Text rewritten to match the data |
| 16 | Minor | Profile heading levels skipped (h1 → h3, h2 → h4) | Corrected |
| 17 | Minor | In translations the theme button's accessible name didn't contain its visible label | Label translated too |
| 18 | Minor | "District or area" was mistranslated by a pattern meant for "District 45%" | Pattern narrowed to numbers |
| 19 | Minor | Search-engine page titles over 70 characters | Shortened |
| 20 | Minor | Child-poverty column said "see Seattle" for three rows | Shows the Seattle-wide figure on each row |

### Known limitations (new)

- Federal incident and staffing data are from 2021-22, the latest released. Staffing and police programs may have changed.
- Healthy Youth Survey district results from Public Health – Seattle & King County are in a dashboard that doesn't allow data export, so the site links to it rather than copying numbers.
- The U.S. Census API now requires a key, so neighborhood figures are links to Census Reporter rather than numbers on the page.
- Lead results cover only testing done by the Department of Health. None are posted for Renton, Issaquah or Bellevue schools; those districts may have tested on their own, so the site tells families to ask.
- Translations cover the interface only and were drafted with machine assistance.

## How to re-run

```
pip install playwright
npm i axe-core html-validate
python3 tests/qa_suite.py          # all tests; writes tests/results.json
python3 tests/qa_suite.py A01 S01  # selected tests
```
