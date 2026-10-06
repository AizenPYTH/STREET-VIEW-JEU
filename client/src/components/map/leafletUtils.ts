import L from 'leaflet';
import { getAvatar } from '@cityguess/shared';

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function createMap(container: HTMLElement, options: L.MapOptions = {}): L.Map {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    touchZoom: true,
    inertia: true,
    worldCopyJump: true,
    zoomSnap: 0.25,
    ...options,
  });
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: 'abcd', maxZoom: 19 }).addTo(map);
  return map;
}

/** Player marker: the avatar's shape and colour (the host's diamond is the brand mark). */
export function guessMarkerIcon(avatar: string, options: { ring?: boolean; pop?: boolean; small?: boolean; label?: string } = {}): L.DivIcon {
  const def = getAvatar(avatar);
  const classes = ['gmk', options.pop ? 'gmk--pop' : '', options.small ? 'gmk--sm' : ''].filter(Boolean).join(' ');
  const label = options.label ? `<span class="gmk__label">${escapeHtml(options.label)}</span>` : '';
  return L.divIcon({
    className: 'cg-marker',
    html: `<div class="${classes}" style="--gmk-color:${def.color}"><span class="gmk__shape gmk__shape--${def.shape}"></span><span class="gmk__dot"></span>${options.ring ? '<span class="gmk__ring"></span>' : ''}${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function truthMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'cg-marker',
    html: `<div class="tmk"><span class="tmk__ring"></span><span class="tmk__ring tmk__ring--2"></span><span class="tmk__dot"></span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Animates a Leaflet polyline as if drawn from start to end (§20). */
export function animateDraw(line: L.Polyline, durationMs = 600): void {
  const path = (line as unknown as { _path?: SVGPathElement })._path;
  if (!path || typeof path.getTotalLength !== 'function') return;
  const length = path.getTotalLength();
  path.style.transition = 'none';
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  void path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${durationMs}ms cubic-bezier(.2,.8,.2,1)`;
  path.style.strokeDashoffset = '0';
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}
