import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { GuessResult, LatLng, PlayerPublic } from '@cityguess/shared';
import { createMap, playerPinIcon, realPinIcon } from './leafletUtils';

interface RevealMapProps {
  location: LatLng;
  results: GuessResult[];
  players: PlayerPublic[];
  /** Pause between each player's marker appearing. */
  stepMs?: number;
}

/** Shows the real location, every guess and the distance lines with a staggered animation. */
export function RevealMap({ location, results, players, stepMs = 450 }: RevealMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = createMap(container, { zoomSnap: 0.25 });
    map.setView([location.lat, location.lng], 15, { animate: false });
    const layers: L.Layer[] = [];
    const timers: number[] = [];

    const real = L.marker([location.lat, location.lng], { icon: realPinIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
    layers.push(real);

    const byId = new Map(players.map((p) => [p.id, p]));
    const points: L.LatLngExpression[] = [[location.lat, location.lng]];
    const ordered = [...results].sort((a, b) => a.distanceMeters - b.distanceMeters);

    ordered.forEach((result, index) => {
      const player = byId.get(result.playerId);
      const timer = window.setTimeout(
        () => {
          const marker = L.marker([result.position.lat, result.position.lng], {
            icon: playerPinIcon(player?.color ?? '#fff', player?.avatar ?? 'fox', { drop: true }),
            interactive: false,
          }).addTo(map);
          const line = L.polyline(
            [
              [result.position.lat, result.position.lng],
              [location.lat, location.lng],
            ],
            { color: player?.color ?? '#fff', weight: 3, opacity: 0.9, className: 'cg-line', interactive: false },
          ).addTo(map);
          layers.push(marker, line);
          points.push([result.position.lat, result.position.lng]);
          map.flyToBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16, duration: 0.6 });
        },
        600 + index * stepMs,
      );
      timers.push(timer);
    });

    const onResize = (): void => map.invalidateSize();
    window.addEventListener('resize', onResize);
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('resize', onResize);
      map.remove();
    };
  }, [location, results, players, stepMs]);

  return <div ref={containerRef} className="map" data-testid="reveal-map" />;
}
