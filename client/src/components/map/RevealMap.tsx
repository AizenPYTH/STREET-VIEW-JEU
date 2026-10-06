import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { revealMarkerAt, TIMINGS, type GuessResult, type LatLng, type PlayerPublic } from '@cityguess/shared';
import { animateDraw, createMap, guessMarkerIcon, truthMarkerIcon } from './leafletUtils';
import { useSequence } from '../../hooks/useSequence';

interface RevealMapProps {
  location: LatLng;
  /** Sorted by distance ascending (server order). */
  results: GuessResult[];
  players: PlayerPublic[];
  revealStartsAt: number;
}

/**
 * Scripted reveal on a real map (phase 2 §4, §27): the real position lands first, then the
 * players appear one by one from the farthest to the closest, each with its line, so the round
 * winner is always the last to drop. The viewport follows every new point (40 px margin).
 */
export function RevealMap({ location, results, players, revealStartsAt }: RevealMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const addedRef = useRef<{ truth: boolean; players: Set<string> }>({ truth: false, players: new Set() });
  /** Reveal order: farthest first. */
  const order = useMemo(() => [...results].sort((a, b) => b.distanceMeters - a.distanceMeters), [results]);
  const checkpoints = useMemo(() => [TIMINGS.reveal.truthMs, ...order.map((_, i) => revealMarkerAt(i))], [order]);
  const elapsed = useSequence(revealStartsAt, checkpoints);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = createMap(container);
    map.setView([location.lat, location.lng], 14, { animate: false });
    mapRef.current = map;
    addedRef.current = { truth: false, players: new Set() };
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
    if (elapsed >= TIMINGS.reveal.truthMs && !added.truth) {
      added.truth = true;
      L.marker([location.lat, location.lng], { icon: truthMarkerIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
    }
    let changed = false;
    order.forEach((r, i) => {
      if (elapsed < revealMarkerAt(i) || added.players.has(r.playerId)) return;
      added.players.add(r.playerId);
      changed = true;
      const player = byId.get(r.playerId);
      L.marker([r.position.lat, r.position.lng], {
        icon: guessMarkerIcon(player?.avatar ?? 'diamond', { pop: true, small: true, label: player?.name ?? '' }),
        interactive: false,
        zIndexOffset: 500 - i,
      }).addTo(map);
      const line = L.polyline(
        [
          [r.position.lat, r.position.lng],
          [location.lat, location.lng],
        ],
        { color: player?.color ?? '#fff', weight: 3, opacity: 0.85, className: 'cg-line', interactive: false },
      ).addTo(map);
      animateDraw(line, 500);
    });
    if (changed) {
      const points: L.LatLngExpression[] = [[location.lat, location.lng], ...order.filter((r) => added.players.has(r.playerId)).map((r) => [r.position.lat, r.position.lng] as L.LatLngExpression)];
      map.flyToBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, duration: 0.45 });
    }
  }, [elapsed, order, players, location]);

  return <div ref={containerRef} className="reveal__map" data-testid="reveal-map" />;
}
