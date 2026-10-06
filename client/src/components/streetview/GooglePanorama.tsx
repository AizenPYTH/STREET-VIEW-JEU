import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../../services/googleMaps';
import { Spinner } from '../ui/Spinner';

interface GooglePanoramaProps {
  panoId: string;
  apiKey: string;
}

/** Deterministic initial heading so every player starts looking the same way. */
function headingFor(panoId: string): number {
  let hash = 0;
  for (const ch of panoId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function GooglePanorama({ panoId, apiKey }: GooglePanoramaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const options: google.maps.StreetViewPanoramaOptions = {
          pano: panoId,
          pov: { heading: headingFor(panoId), pitch: 0 },
          zoom: 0,
          visible: true,
          disableDefaultUI: true,
          linksControl: true,
          clickToGo: true,
          showRoadLabels: false,
          addressControl: false,
          fullscreenControl: false,
          enableCloseButton: false,
          motionTracking: false,
          motionTrackingControl: false,
          zoomControl: false,
          panControl: false,
          scrollwheel: true,
        };
        const pano = panoRef.current ?? new maps.StreetViewPanorama(containerRef.current, options);
        if (panoRef.current) pano.setOptions(options);
        panoRef.current = pano;
        const listener = pano.addListener('status_changed', () => {
          const s = pano.getStatus();
          if (s === maps.StreetViewStatus.OK) setStatus('ready');
          else {
            setStatus('error');
            setMessage('This panorama is unavailable right now.');
          }
        });
        return () => listener.remove();
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setStatus('error');
        setMessage(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [panoId, apiKey]);

  return (
    <div className="pano" data-testid="panorama" data-provider="google" data-pano={panoId}>
      <div ref={containerRef} className="pano__canvas" />
      {status !== 'ready' && (
        <div className="pano__overlay">
          {status === 'loading' ? (
            <>
              <Spinner size={32} />
              <span>Loading street view…</span>
            </>
          ) : (
            <span className="pano__error">{message}</span>
          )}
        </div>
      )}
    </div>
  );
}
