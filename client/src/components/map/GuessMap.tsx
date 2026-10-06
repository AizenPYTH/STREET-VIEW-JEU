import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { City, LatLng } from '@cityguess/shared';
import { createMap, playerPinIcon } from './leafletUtils';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

interface GuessMapProps {
  city: City;
  marker: LatLng | null;
  onMarkerChange(position: LatLng): void;
  locked: boolean;
  color: string;
  avatar: string;
}

/** Full‑screen Leaflet map where the player drops and drags their guess marker. */
export function GuessMap({ city, marker, onMarkerChange, locked, color, avatar }: GuessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onMarkerChange);
  onChangeRef.current = onMarkerChange;
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
      { padding: [12, 12] },
    );
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (lockedRef.current) return;
      playSound('click');
      haptic('light');
      onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    const onResize = (): void => map.invalidateSize();
    window.addEventListener('resize', onResize);
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
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
      const m = L.marker([marker.lat, marker.lng], {
        icon: playerPinIcon(color, avatar, { draggable: !locked, drop: true }),
        draggable: !locked,
        keyboard: false,
      }).addTo(map);
      m.on('dragend', () => {
        const p = m.getLatLng();
        haptic('light');
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([marker.lat, marker.lng]);
      markerRef.current.setIcon(playerPinIcon(color, avatar, { draggable: !locked }));
      if (locked) markerRef.current.dragging?.disable();
      else markerRef.current.dragging?.enable();
    }
  }, [marker, locked, color, avatar]);

  return <div ref={containerRef} className="map" data-testid="guess-map" />;
}
