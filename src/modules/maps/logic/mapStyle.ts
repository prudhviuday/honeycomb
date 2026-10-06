import type { StyleSpecification } from 'maplibre-gl';

/**
 * Dark MapLibre style with no API key requirement.
 *
 * OpenFreeMap provides free OpenStreetMap-based vector tiles and a
 * MapLibre-compatible dark style. The map component adds a lightweight
 * 3D building extrusion layer on top of this style.
 */
export const honeybadgerMapStyle =
  'https://tiles.openfreemap.org/styles/dark' as unknown as StyleSpecification;

/** MapLibre layer configuration for subtle, game-like 3D buildings. */
export const honeycombBuildingLayer = {
  id: 'honeycomb-3d-buildings',
  type: 'fill-extrusion' as const,
  source: 'openmaptiles',
  'source-layer': 'building',
  minzoom: 14,
  paint: {
    'fill-extrusion-color': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14,
      '#17151b',
      16,
      '#25212b',
      18,
      '#302a36',
    ],
    'fill-extrusion-height': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14,
      0,
      15,
      ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
    ],
    'fill-extrusion-base': [
      'coalesce',
      ['get', 'render_min_height'],
      ['get', 'min_height'],
      0,
    ],
    'fill-extrusion-opacity': 0.82,
    'fill-extrusion-vertical-gradient': true,
  },
};
