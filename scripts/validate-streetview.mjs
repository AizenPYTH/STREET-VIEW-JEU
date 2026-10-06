#!/usr/bin/env node
/**
 * Real Google validation (phase 2 §42): resolves random points in every zone of the chosen cities
 * through the Street View metadata API and prints coverage + latency per zone, so weak zones can
 * be moved before a public release. Metadata requests are free of charge.
 *
 *   GOOGLE_MAPS_SERVER_KEY=… node scripts/validate-streetview.mjs marseille paris london tokyo new-york
 *   (add --samples 6 to change the number of points per zone; no city = all cities)
 */
import { CITIES, randomPointInRadius, distanceBetween } from '../packages/shared/dist/index.js';

const key = process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error('Set GOOGLE_MAPS_SERVER_KEY (or GOOGLE_MAPS_API_KEY).');
  process.exit(1);
}
const args = process.argv.slice(2);
const samplesIndex = args.indexOf('--samples');
const samples = samplesIndex >= 0 ? Number(args[samplesIndex + 1]) : 4;
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--samples');
const cities = wanted.length ? CITIES.filter((c) => wanted.includes(c.id)) : CITIES;

async function resolve(point, radius) {
  const url = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
  url.searchParams.set('location', `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('source', 'outdoor');
  url.searchParams.set('key', key);
  const started = Date.now();
  const res = await fetch(url);
  const body = await res.json();
  return { status: body.status, ms: Date.now() - started, location: body.location ?? null, date: body.date ?? null, error: body.error_message ?? null };
}

const weak = [];
for (const city of cities) {
  console.log(`\n${city.flag} ${city.name}`);
  for (const zone of city.zones) {
    let ok = 0;
    let totalMs = 0;
    let snap = 0;
    let oldest = null;
    let lastError = null;
    for (let i = 0; i < samples; i++) {
      const point = randomPointInRadius(zone.center, zone.radiusMeters, Math.random);
      const r = await resolve(point, 150);
      totalMs += r.ms;
      if (r.status === 'OK') {
        ok++;
        snap += distanceBetween(point, r.location);
        if (r.date && (!oldest || r.date < oldest)) oldest = r.date;
      } else if (r.status !== 'ZERO_RESULTS') lastError = `${r.status}${r.error ? ` — ${r.error}` : ''}`;
    }
    const rate = ok / samples;
    console.log(
      `  ${zone.name.padEnd(22)} ${zone.difficulty.padEnd(7)} coverage ${(rate * 100).toFixed(0).padStart(3)}%  snap ${ok ? Math.round(snap / ok) : '—'} m  ${Math.round(totalMs / samples)} ms  oldest ${oldest ?? '—'}${lastError ? `  ⚠ ${lastError}` : ''}`,
    );
    if (rate < 0.5) weak.push(`${city.name} / ${zone.name} (${(rate * 100).toFixed(0)}%)`);
    if (lastError) {
      console.error(`\nAPI error, stopping: ${lastError}`);
      process.exit(2);
    }
  }
}
console.log(weak.length ? `\nZones under 50% coverage, consider moving them:\n - ${weak.join('\n - ')}` : '\nAll zones have at least 50% coverage.');
