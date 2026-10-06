import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { City, LatLng } from '@cityguess/shared';
import { createMap, guessMarkerIcon } from './leafletUtils';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface GuessMapProps {
  city: City;
  marker: LatLng | null;
  onPlace(position: LatLng): void;
  locked: boolean;
  avatar: string;
}

/** Map card: a tap places or moves the marker (§19). Pinch/pan are native. */
export function GuessMap({ city, marker, onPlace, locked, avatar }: GuessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = createMap(container);
    const [s, w, n, e] = city.bounds;
    map.fitBounds(
      [
        [s, w],
        [n, e],
      ],
      { padding: [8, 8], animate: false },
    );
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (lockedRef.current) return;
      playSound('marker');
      haptic('selection');
      onPlaceRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    const resize = (): void => {
      map.invalidateSize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const raf = requestAnimationFrame(resize);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [city]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([marker.lat, marker.lng], { icon: guessMarkerIcon(avatar, { ring: true }), interactive: false, keyboard: false }).addTo(map);
    } else {
      markerRef.current.setLatLng([marker.lat, marker.lng]);
      markerRef.current.setIcon(guessMarkerIcon(avatar, { ring: !locked }));
    }
  }, [marker, locked, avatar]);

  return <div ref={containerRef} className="guess__map" data-testid="guess-map" />;
}
