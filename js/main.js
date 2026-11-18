// Entry point: loads data, sets up the theme toggle, and routes between pages using the URL hash.
//   #home  #find  #compare  #findings  #safety  #glossary  #method  #s-<school code>

import { loadData, store } from './data.js';
import { computeScores } from './scores.js';
import { initCompareList } from './compare-list.js';
import { resizeMaps, hasLiveMaps } from './maps.js';
import { hideTip, escapeHtml, $, $$ } from './util.js';
import { reportUrl } from './feedback.js';
import { initI18n } from './i18n.js';
import { renderHome } from './views/home.js';
import { renderFind } from './views/find.js';
import { renderSchool } from './views/school.js';
import { renderCompare } from './views/compare.js';
import { renderFindings } from './views/findings.js';
import { renderSafety } from './views/safety.js';
import { initInfoTips, renderGlossary } from './glossary.js';

const PAGES = {
  home: renderHome,
  find: renderFind,
  compare: renderCompare,
  findings: renderFindings,
  safety: renderSafety,
  glossary: renderGlossary,
  method: () => {}, // static content in index.html
};

function currentRoute() {
  const hash = location.hash.slice(1) || 'home';
  const match = hash.match(/^s-(\d+)$/);
  if (match && store.byCode[match[1]]) return { page: 'school', code: match[1] };
  return { page: PAGES[hash] ? hash : 'home' };
}

function route() {
  hideTip();
  const { page, code } = currentRoute();
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === `v-${page}`));
  $$('#nav a').forEach((a) => {
    const on = a.getAttribute('href') === `#${page}`;
    a.classList.toggle('on', on);
    if (on) a.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });

  if (page === 'school') renderSchool(code);
  else PAGES[page]();

  const navLabel = $('#nav a.on')?.firstChild?.textContent;
  document.title = page === 'school' ? `${store.byCode[code].name} · South King Schools`
    : page === 'home' ? 'South King Schools'
      : `${navLabel} · South King Schools`;
}

function setUpTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('sks-theme');
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch { /* storage blocked */ }
  $('#themeBtn').addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('sks-theme', next); } catch { /* ignore */ }
    route(); // redraw maps with the right tile style
  });
}

/** Keeps the Sources list in step with the data file, so automatic updates don't leave it stale. */
function initSources() {
  const ds = store.sources.datasets;
  const yr = store.sources;
  const link = (id, text) => `<a href="https://data.wa.gov/d/${id}">${text}</a>`;
  if (ds?.enrollment) {
    const parts = [
      ['enrollment', 'enrollment'], ['assessment', 'assessment', ' (Smarter Balanced and WCAS; WA-AIM excluded)'], ['discipline', 'discipline'],
      ['graduation', 'graduation'], ['sqss', 'attendance, 9th grade on track and dual credit'], ['growth', 'growth'], ['wakids', 'kindergarten readiness'],
    ].filter(([k]) => ds[k]).map(([k, text, extra = '']) => `${link(ds[k], text)}${extra}${yr[k] && yr[k] !== store.schoolYear ? ` (${yr[k]}, the latest released)` : ''}`);
    $('#ospiSrc').innerHTML = `OSPI Report Card files on data.wa.gov, ${store.schoolYear}: ${parts.join(', ')}, ${link('gks4-v7ka', 'student–teacher ratio')}. ${store.disciplineTrend?.datasets ? `District discipline trend from the ${Object.entries(store.disciplineTrend.datasets).map(([y, id]) => link(id, y)).join(', ')} files.` : ''}`;
  }
  const ty = store.trendYears || [];
  if (ty.length > 1) $('#trendSrc').innerHTML = `Trends: the same OSPI files for ${link('4h5k-di3v', ty[0])} and ${ty[1]} through ${ty[ty.length - 1]} (assessment, discipline, attendance and enrollment for each year).`;
}

function initFooter() {
  const month = new Date(`${store.generated}T12:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  $('#dataStamp').textContent = `Data updated ${month}; school results are ${store.schoolYear}.`;
  const link = $('#reportLink');
  link.href = reportUrl();
  // Refresh on use so a prefilled form names the page the reader is on now.
  ['pointerdown', 'focus'].forEach((ev) => link.addEventListener(ev, () => { link.href = reportUrl(); }));
}

/** Optional visit counts with GoatCounter (no cookies, no personal data). Off unless meta.analytics.goatcounter is set. */
function initAnalytics() {
  const code = store.meta.analytics?.goatcounter;
  if (!code || !/^[a-z0-9-]+$/i.test(code)) return;
  window.goatcounter = { no_onload: true };
  const sc = Object.assign(document.createElement('script'), { async: true, src: 'https://gc.zgo.at/count.js' });
  sc.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  sc.addEventListener('load', countPage);
  document.head.append(sc);
}

function countPage() {
  // Count the page type, never the address someone searched for.
  const page = (location.hash.slice(1) || 'home').replace(/^s-\d+$/, 'school');
  window.goatcounter?.count?.({ path: `/${page}`, title: page });
}

async function start() {
  setUpTheme();
  try {
    await loadData();
  } catch (err) {
    $('main').innerHTML = `<div class="wrap" style="padding:60px 20px"><h2>The school data didn't load.</h2><p class="lede">${escapeHtml(err.message)}. If you opened index.html directly from your computer, run it through a local web server instead (see README.md).</p></div>`;
    return;
  }
  store.trend = computeScores(store.schools);
  initCompareList();
  initInfoTips();
  initFooter();
  initSources();
  initAnalytics();
  initI18n(store.i18n, () => route());

  let previousHash = location.hash;
  addEventListener('hashchange', () => {
    const stayingOnFind = previousHash.startsWith('#find') && location.hash.startsWith('#find');
    previousHash = location.hash;
    route();
    countPage();
    if (!stayingOnFind) scrollTo(0, 0);
  });
  addEventListener('scroll', hideTip, { passive: true });

  let resizeTimer;
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeMaps();
      if (Math.abs(innerWidth - lastWidth) > 60) {
        lastWidth = innerWidth;
        if (!hasLiveMaps()) route(); // fallback dot plots need a redraw at the new size
      }
    }, 250);
  });

  route();
}

start();
