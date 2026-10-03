import type { StyleSpecification } from 'maplibre-gl';

/**
 * Custom dark cinematic MapLibre style for Honeybadger Media.
 * No external tile server required — uses a free dark raster tile source.
 * Dark charcoal base with subtle roads, warm labels, and gold accent potential.
 */
export const honeybadgerMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    'osm-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxzoom: 20,
    },
    'osm-labels': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#0B0B0B',
      },
    },
    {
      id: 'dark-tiles',
      type: 'raster',
      source: 'osm-dark',
      paint: {
        'raster-opacity': 0.85,
        'raster-saturation': -0.3,
        'raster-contrast': 0.15,
      },
    },
    {
      id: 'labels',
      type: 'raster',
      source: 'osm-labels',
      paint: {
        'raster-opacity': 0.6,
      },
    },
  ],
};
