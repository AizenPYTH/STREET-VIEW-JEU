import { useEffect, useState } from 'react';
import { loadGoogleMaps } from '../services/googleMaps';
import { useConfig } from './useConfig';

export type StreetViewAvailability = 'checking' | 'ready' | 'error';

/** Checks that this device can load street views (lobby PRÊT status, §33). */
export function useStreetViewReady(attempt = 0): StreetViewAvailability {
  const config = useConfig();
  const [state, setState] = useState<StreetViewAvailability>('checking');
  useEffect(() => {
    let cancelled = false;
    setState('checking');
    if (config.streetViewProvider !== 'google' || !config.googleMapsBrowserKey) {
      setState('ready');
      return;
    }
    loadGoogleMaps(config.googleMapsBrowserKey)
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [config, attempt]);
  return state;
}
