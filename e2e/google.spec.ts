import { expect, test } from '@playwright/test';

/**
 * Real Street View smoke test (phase 2 §42). Skipped unless a browser key is provided:
 *   GOOGLE_MAPS_API_KEY=… npx playwright test e2e/google.spec.ts
 * It loads the Maps JavaScript API in the real browser and renders a known panorama in each city
 * through the same options the game uses, measuring load latency and checking navigation links.
 */
const key = process.env.GOOGLE_MAPS_BROWSER_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

const SPOTS = [
  { city: 'Marseille', lat: 43.2951, lng: 5.374 },
  { city: 'Paris', lat: 48.8584, lng: 2.3488 },
  { city: 'London', lat: 51.5138, lng: -0.1313 },
  { city: 'Tokyo', lat: 35.6595, lng: 139.7005 },
  { city: 'New York', lat: 40.7484, lng: -73.9857 },
];

test.describe('Google Street View (real key)', () => {
  test.skip(!key, 'GOOGLE_MAPS_BROWSER_KEY / GOOGLE_MAPS_API_KEY not set');

  for (const spot of SPOTS) {
    test(`renders a navigable panorama in ${spot.city}`, async ({ page }) => {
      await page.setContent(`<!doctype html><html><body style="margin:0"><div id="pano" style="width:390px;height:664px"></div></body></html>`);
      const result = await page.evaluate(
        async ({ apiKey, lat, lng }) => {
          const started = performance.now();
          await new Promise<void>((resolve, reject) => {
            (window as unknown as Record<string, unknown>).__ready = resolve;
            const s = document.createElement('script');
            s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async&callback=__ready`;
            s.onerror = () => reject(new Error('script failed'));
            document.head.appendChild(s);
          });
          const g = (window as unknown as { google: typeof google }).google;
          const service = new g.maps.StreetViewService();
          const meta = await service.getPanorama({ location: { lat, lng }, radius: 150, source: g.maps.StreetViewSource.OUTDOOR });
          const panoId = meta.data.location?.pano ?? '';
          const pano = new g.maps.StreetViewPanorama(document.getElementById('pano') as HTMLElement, {
            pano: panoId,
            disableDefaultUI: true,
            linksControl: true,
            showRoadLabels: false,
            addressControl: false,
            visible: true,
          });
          const status = await new Promise<string>((resolve) => {
            pano.addListener('status_changed', () => resolve(String(pano.getStatus())));
          });
          const links = pano.getLinks()?.length ?? 0;
          return { panoId, status, links, ms: Math.round(performance.now() - started), heading: pano.getPov().heading };
        },
        { apiKey: key as string, lat: spot.lat, lng: spot.lng },
      );
      console.log(`${spot.city}: pano ${result.panoId} status ${result.status} links ${result.links} in ${result.ms} ms`);
      expect(result.status).toBe('OK');
      expect(result.panoId).not.toBe('');
      expect(result.links).toBeGreaterThan(0);
      expect(result.ms).toBeLessThan(10_000);
    });
  }
});
