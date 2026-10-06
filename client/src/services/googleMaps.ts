/** Loads the Google Maps JavaScript API once (Street View lives in the core library). */
let loading: Promise<typeof google.maps> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof google !== 'undefined' && google.maps?.StreetViewPanorama) return Promise.resolve(google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const callbackName = '__cityguessMapsReady';
    const w = window as unknown as Record<string, unknown>;
    w[callbackName] = () => {
      delete w[callbackName];
      resolve(google.maps);
    };
    const script = document.createElement('script');
    const params = new URLSearchParams({ key: apiKey, v: 'weekly', loading: 'async', callback: callbackName });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google Maps. Check your connection and the API key.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
