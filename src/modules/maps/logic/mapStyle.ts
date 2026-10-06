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
export const honeycombRoadGlowLayers = [
  {
    id: 'honeycomb-road-glow',
    type: 'line' as const,
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 5,
    paint: {
      'line-color': [
        'match', ['get', 'class'],
        'motorway', '#ff9b4a',
        'trunk', '#ff8a3d',
        'primary', '#ff7a35',
        'secondary', '#f06a3a',
        'tertiary', '#b95b55',
        'rgba(120,70,80,0.35)',
      ],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.8,
        8, 1.5,
        11, 2.2,
        14, 3.2,
        17, 4.2,
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.35,
        8, 0.48,
        11, 0.58,
        14, 0.72,
        17, 0.82,
      ],
      'line-blur': 0.8,
    },
  },
  {
    id: 'honeycomb-road-core',
    type: 'line' as const,
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 7,
    paint: {
      'line-color': '#ffd08a',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        7, 0.35,
        10, 0.65,
        14, 1.1,
        17, 1.6,
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        7, 0.32,
        10, 0.42,
        14, 0.56,
        17, 0.66,
      ],
    },
  },
];

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
