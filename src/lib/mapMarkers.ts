import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { MarkerCategory } from './mapData';

const categoryIcons: Record<MarkerCategory, string> = {
  activation: '🎬',
  reward: '🎁',
  mission: '⚡',
  venue: '📍',
};

const categorySize: Record<MarkerCategory, { w: number; h: number }> = {
  activation: { w: 40, h: 40 },
  reward: { w: 36, h: 36 },
  mission: { w: 34, h: 34 },
  venue: { w: 32, h: 32 },
};

/**
 * Create a custom HTML marker for a campaign location.
 * Gold outer glow for unscanned, charcoal with checkmark for scanned.
 */
export function createCampaignMarker(
  map: MapLibreMap,
  lng: number,
  lat: number,
  category: MarkerCategory,
  isScanned: boolean,
  onClick: () => void,
): Marker {
  const size = categorySize[category] ?? categorySize.venue;
  const el = document.createElement('div');
  el.className = 'hb-marker';
  el.style.width = `${size.w}px`;
  el.style.height = `${size.h}px`;
  el.innerHTML = isScanned
    ? `<div class="hb-marker-scanned">
         <span class="hb-marker-icon">${categoryIcons[category]}</span>
         <div class="hb-marker-check">✓</div>
       </div>`
    : `<div class="hb-marker-active">
         <div class="hb-marker-pulse"></div>
         <span class="hb-marker-icon">${categoryIcons[category]}</span>
       </div>`;

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  const marker = new Marker({ element: el, anchor: 'center' });
  marker.setLngLat([lng, lat]).addTo(map);
  return marker;
}

/**
 * Create a cluster marker (count badge).
 */
export function createClusterMarker(
  map: MapLibreMap,
  lng: number,
  lat: number,
  count: number,
  onClick: () => void,
): Marker {
  const el = document.createElement('div');
  el.className = 'hb-cluster';
  el.innerHTML = `<span>${count}</span>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  const marker = new Marker({ element: el, anchor: 'center' });
  marker.setLngLat([lng, lat]).addTo(map);
  return marker;
}

/**
 * Create user location marker — gold/white center with accuracy circle.
 */
export function createUserMarker(
  map: MapLibreMap,
  lng: number,
  lat: number,
): { marker: Marker; el: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'hb-user-loc';
  el.innerHTML = `
    <div class="hb-user-pulse"></div>
    <div class="hb-user-dot"></div>
  `;
  const marker = new Marker({ element: el, anchor: 'center' });
  marker.setLngLat([lng, lat]).addTo(map);
  return { marker, el };
}
