import type { StyleSpecification } from 'maplibre-gl';

export const honeybadgerMapStyle =
  'https://tiles.openfreemap.org/styles/dark' as unknown as StyleSpecification;

/**
 * Warm orange/gold road network inspired by the glowing Starva-style look.
 *
 * Important: do not filter this by road class. OpenFreeMap progressively
 * generalizes transportation features as zoom changes, so a class-only
 * layer can make secondary/local roads appear to blink out while zooming.
 * These layers intentionally draw the whole transportation source and use
 * multiple passes to create a continuous glow.
 */
export const honeycombRoadGlowLayers = [
  {
    id: 'honeycomb-road-ambient-glow',
    type: 'line' as const,
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 3,
    paint: {
      'line-color': '#ff7a32',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        3, 1.2,
        5, 2.0,
        8, 3.0,
        11, 4.2,
        14, 5.8,
        17, 7.0,
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        3, 0.24,
        5, 0.30,
        8, 0.38,
        11, 0.46,
        14, 0.54,
        17, 0.62,
      ],
      'line-blur': 2.2,
      'line-cap': 'round',
      'line-join': 'round',
    },
  },
  {
    id: 'honeycomb-road-glow',
    type: 'line' as const,
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 3,
    paint: {
      'line-color': [
        'match', ['get', 'class'],
        'motorway', '#ffbd68',
        'trunk', '#ff9d4d',
        'primary', '#ff8b3d',
        'secondary', '#ff7840',
        'tertiary', '#e66a4e',
        '#d96555',
      ],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        3, 0.65,
        5, 1.0,
        8, 1.55,
        11, 2.35,
        14, 3.35,
        17, 4.4,
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        3, 0.42,
        5, 0.50,
        8, 0.58,
        11, 0.66,
        14, 0.74,
        17, 0.84,
      ],
      'line-blur': 0.85,
      'line-cap': 'round',
      'line-join': 'round',
    },
  },
  {
    id: 'honeycomb-road-core',
    type: 'line' as const,
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: 5,
    paint: {
      'line-color': '#ffd99b',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.35,
        8, 0.55,
        11, 0.85,
        14, 1.25,
        17, 1.75,
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.34,
        8, 0.40,
        11, 0.48,
        14, 0.58,
        17, 0.70,
      ],
      'line-cap': 'round',
      'line-join': 'round',
    },
  },
];

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
