// Street maps (Leaflet + OpenStreetMap tiles), with a plain dot plot as a fallback
// for places where map images can't load (for example, inside a sandboxed preview).

import { cssVar, isDarkTheme, escapeHtml, showTip, hideTip } from './util.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let tilesWork = null; // null = unknown yet, then true/false after the first map tries
const liveMaps = {};

/**
 * Creates a Leaflet map in `el` under a reuse key (an older map with the same key is removed).
 * Calls `fallback()` instead when Leaflet is missing or map images fail to load.
 */
export function createMap(key, el, fallback) {
  removeMap(key);
  const L = window.L;
  if (!L || tilesWork === false) {
    fallback();
    return null;
  }
  el.innerHTML = '';
  el.classList.toggle('darkmap', isDarkTheme());
  const map = L.map(el, { scrollWheelZoom: false, preferCanvas: true, zoomSnap: 0.25, zoomDelta: 0.5 });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

  let loaded = 0;
  let failed = 0;
  tiles.on('tileload', () => { loaded++; tilesWork = true; });
  tiles.on('tileerror', () => {
    failed++;
    if (!loaded && failed >= 3 && tilesWork !== true) {
      tilesWork = false;
      removeMap(key);
      fallback();
    }
  });
  // Don't hijack page scrolling; zoom with the wheel only after the map is clicked.
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());

  liveMaps[key] = map;
  return map;
}

export function removeMap(key) {
  if (liveMaps[key]) {
    try { liveMaps[key].remove(); } catch { /* already gone */ }
    delete liveMaps[key];
  }
}

export function resizeMaps() {
  Object.values(liveMaps).forEach((m) => { try { m.invalidateSize(); } catch { /* ignore */ } });
}

export const hasLiveMaps = () => Object.keys(liveMaps).length > 0;

/** Dot radius in pixels, scaled by enrollment. */
export function dotRadius(school, divisor = 4) {
  return Math.max(4, Math.min(11, Math.sqrt(school.enrollment || 100) / divisor));
}

/**
 * Adds one dot per school. `colorOf(s)` returns a CSS color, `tipOf(s)` tooltip HTML.
 * Clicking a dot opens the school page. Returns the layer (for fitting bounds).
 */
export function addSchoolDots(map, schools, colorOf, tipOf) {
  const L = window.L;
  const ring = cssVar('--surface');
  const layer = L.featureGroup();
  [...schools]
    .sort((a, b) => b.enrollment - a.enrollment) // big schools underneath
    .forEach((s) => {
      L.circleMarker([s.lat, s.lon], { radius: dotRadius(s), fillColor: colorOf(s), fillOpacity: 0.92, color: ring, weight: 1.5 })
        .bindTooltip(tipOf(s), { direction: 'top', offset: [0, -4] })
        .on('click', () => { location.hash = `s-${s.code}`; })
        .addTo(layer);
    });
  layer.addTo(map);
  return layer;
}

// ---------- Fallback: dots on a blank canvas ----------

/** Equirectangular projection fitted to the given schools. */
export function projection(width, height, pad, schools) {
  const kx = Math.cos((47.47 * Math.PI) / 180);
  const xs = schools.map((s) => s.lon * kx);
  const ys = schools.map((s) => s.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((width - 2 * pad) / (maxX - minX), (height - 2 * pad) / (maxY - minY));
  const ox = (width - (maxX - minX) * k) / 2;
  const oy = (height - (maxY - minY) * k) / 2;
  return { x: (p) => ox + (p.lon * kx - minX) * k, y: (p) => oy + (maxY - p.lat) * k };
}

/** Draws a plain SVG dot plot. Dots link to school pages. */
export function drawDotPlot(el, schools, { width, height, colorVarOf, tipOf, extentSchools, labels }) {
  const P = projection(width, height, width < 500 ? 14 : 26, extentSchools || schools);
  const scale = Math.max(0.6, Math.min(1, width / 900));
  let svg = `<svg width="${width}" height="${height}" role="img" aria-label="Map of school locations">`;
  [...schools]
    .sort((a, b) => b.enrollment - a.enrollment)
    .forEach((s) => {
      const r = Math.max(3.5, (Math.sqrt(s.enrollment || 100) / 4.2) * scale);
      svg += `<circle data-code="${s.code}" cx="${P.x(s).toFixed(1)}" cy="${P.y(s).toFixed(1)}" r="${r.toFixed(1)}" fill="var(${colorVarOf(s)})" stroke="var(--surface)" stroke-width="1.5" style="cursor:pointer"/>`;
    });
  (labels || []).forEach(({ text, at }) => {
    const half = text.length * 3.6 + 6;
    const x = Math.min(width - half, Math.max(half, P.x(at)));
    const y = Math.max(14, Math.min(height - 6, P.y(at) - 30));
    svg += `<text class="lbl" x="${x}" y="${y}" text-anchor="middle">${escapeHtml(text)}</text>`;
  });
  el.innerHTML = svg + '</svg>';
  el.querySelectorAll('circle[data-code]').forEach((c) => {
    const s = schools.find((x) => x.code === c.dataset.code);
    c.addEventListener('mousemove', (e) => showTip(tipOf(s), e));
    c.addEventListener('mouseleave', hideTip);
    c.addEventListener('click', () => { location.hash = `s-${s.code}`; });
  });
}
