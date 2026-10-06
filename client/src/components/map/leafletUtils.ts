import L from 'leaflet';
import { avatarEmoji } from '@cityguess/shared';

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function createMap(container: HTMLElement, options: L.MapOptions = {}): L.Map {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    tap: true,
    touchZoom: true,
    inertia: true,
    worldCopyJump: true,
    ...options,
  } as L.MapOptions);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: 'abcd', maxZoom: 19, detectRetina: false }).addTo(map);
  return map;
}

export function playerPinIcon(color: string, avatar: string, options: { draggable?: boolean; drop?: boolean } = {}): L.DivIcon {
  const classes = ['cg-pin', options.draggable ? 'cg-pin--draggable' : '', options.drop ? 'cg-pin--drop' : ''].filter(Boolean).join(' ');
  return L.divIcon({
    className: 'cg-marker',
    html: `<div class="${classes}" style="--pin-color:${color}"><span class="cg-pin__stem"></span><span class="cg-pin__dot">${avatarEmoji(avatar)}</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function realPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'cg-marker',
    html: `<div class="cg-pin cg-pin--real cg-pin--drop"><span class="cg-pin__stem"></span><span class="cg-pin__dot">📍</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
