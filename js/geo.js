// Distances, address lookup and the visitor's chosen location.

import { session } from './util.js';
import { store } from './data.js';

export function milesBetween(a, b) {
  const R = 6371; // km
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 0.621371;
}

/** Center of the schools in a ZIP code (good enough for "near me" sorting). */
function zipCenter(zip) {
  const inZip = store.schools.filter((s) => s.zip === zip && s.lat);
  if (!inZip.length) return null;
  return {
    lat: inZip.reduce((t, s) => t + s.lat, 0) / inZip.length,
    lon: inZip.reduce((t, s) => t + s.lon, 0) / inZip.length,
  };
}

// Search box bounds: roughly Seattle to Black Diamond, Puget Sound to Sammamish.
const VIEWBOX = '-122.55,47.72,-121.85,47.28';

/**
 * Turns a ZIP code or address into { lat, lon, label }.
 * ZIPs resolve locally; addresses use OpenStreetMap's Nominatim service.
 * Returns null when nothing matches; throws when the lookup can't be reached.
 */
export async function geocode(query) {
  const q = query.trim();
  if (/^\d{5}$/.test(q)) {
    const c = zipCenter(q);
    if (c) return { ...c, label: `ZIP ${q}`, approx: true };
  }
  const withState = /\b(wa|washington)\b/i.test(q) ? q : `${q}, WA`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(withState)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Address lookup failed');
  const hits = await res.json();
  if (!hits.length) return null;
  return { lat: Number(hits[0].lat), lon: Number(hits[0].lon), label: hits[0].display_name.split(',').slice(0, 3).join(',') };
}

export function browserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location isn't available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'your location' }),
      () => reject(new Error('Location permission was declined or unavailable.')),
      { timeout: 10000 },
    );
  });
}

// The visitor's chosen location survives page navigation within the tab.
let current = session.get('sks-location');

export const userLocation = {
  get: () => current,
  set(loc) {
    current = loc;
    session.set('sks-location', loc);
  },
};
