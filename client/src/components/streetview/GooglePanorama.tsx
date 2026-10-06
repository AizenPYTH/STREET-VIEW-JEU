import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../../services/googleMaps';
import { Loader } from '../ui/Spinner';
import { Button } from '../ui/Button';

interface GooglePanoramaProps {
  panoId: string;
  apiKey: string;
  onReady(): void;
}

/** Deterministic initial heading so every player starts looking the same way. */
function headingFor(panoId: string): number {
  let hash = 0;
  for (const ch of panoId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function GooglePanorama({ panoId, apiKey, onReady }: GooglePanoramaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;
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
        listener = pano.addListener('status_changed', () => {
          if (pano.getStatus() === maps.StreetViewStatus.OK) {
            setStatus('ready');
            onReadyRef.current();
          } else setStatus('error');
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [panoId, apiKey, attempt]);

  return (
    <div className="pano" data-testid="panorama" data-provider="google" data-pano={panoId} data-status={status}>
      <div ref={containerRef} className="pano__canvas" />
      {status !== 'ready' && (
        <div className="pano__overlay">
          {status === 'loading' ? (
            <Loader label="Chargement de la rue…" />
          ) : (
            <>
              <p className="t-body">La vue rue n'a pas chargé</p>
              <Button variant="secondary" filled onClick={() => setAttempt((a) => a + 1)} style={{ width: 'auto', padding: '0 24px' }}>
                Réessayer
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
