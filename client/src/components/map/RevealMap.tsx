import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { TIMINGS, type GuessResult, type LatLng, type PlayerPublic } from '@cityguess/shared';
import { animateDraw, createMap, guessMarkerIcon, truthMarkerIcon } from './leafletUtils';
import { useSequence } from '../../hooks/useSequence';

interface RevealMapProps {
  location: LatLng;
  /** Sorted by distance ascending (server order). */
  results: GuessResult[];
  players: PlayerPublic[];
  revealStartsAt: number;
}

/** Scripted reveal on a real map (§20): truth at 500 ms, markers from 1100, lines from 1900. */
export function RevealMap({ location, results, players, revealStartsAt }: RevealMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const addedRef = useRef<{ truth: boolean; markers: Set<number>; lines: Set<number> }>({ truth: false, markers: new Set(), lines: new Set() });
  const { reveal } = TIMINGS;
  const checkpoints = useMemo(() => {
    const cps: number[] = [reveal.truthMs];
    results.forEach((_, i) => {
      cps.push(reveal.markersMs + i * reveal.markerStepMs, reveal.linesMs + i * reveal.markerStepMs);
    });
    return cps;
  }, [results, reveal]);
  const elapsed = useSequence(revealStartsAt, checkpoints);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = createMap(container);
    map.setView([location.lat, location.lng], 14, { animate: false });
    mapRef.current = map;
    addedRef.current = { truth: false, markers: new Set(), lines: new Set() };
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
    };
  }, [location]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const byId = new Map(players.map((p) => [p.id, p]));
    const added = addedRef.current;
    if (elapsed >= reveal.truthMs && !added.truth) {
      added.truth = true;
      L.marker([location.lat, location.lng], { icon: truthMarkerIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
    }
    let fit = false;
    results.forEach((r, i) => {
      const player = byId.get(r.playerId);
      if (elapsed >= reveal.markersMs + i * reveal.markerStepMs && !added.markers.has(i)) {
        added.markers.add(i);
        L.marker([r.position.lat, r.position.lng], { icon: guessMarkerIcon(player?.avatar ?? 'diamond', { pop: true, small: true }), interactive: false }).addTo(map);
        fit = true;
      }
      if (elapsed >= reveal.linesMs + i * reveal.markerStepMs && !added.lines.has(i)) {
        added.lines.add(i);
        const line = L.polyline(
          [
            [r.position.lat, r.position.lng],
            [location.lat, location.lng],
          ],
          { color: player?.color ?? '#fff', weight: 3, opacity: 0.85, className: 'cg-line', interactive: false },
        ).addTo(map);
        animateDraw(line, 600);
      }
    });
    if (fit) {
      const points: L.LatLngExpression[] = [[location.lat, location.lng], ...results.filter((_, i) => added.markers.has(i)).map((r) => [r.position.lat, r.position.lng] as L.LatLngExpression)];
      map.flyToBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, duration: 0.5 });
    }
  }, [elapsed, results, players, location, reveal]);

  return <div ref={containerRef} className="reveal__map" data-testid="reveal-map" />;
}
