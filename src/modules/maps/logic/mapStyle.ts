import type { StyleSpecification } from 'maplibre-gl';

/**
 * Dark MapLibre style with no API key requirement.
 *
 * OpenFreeMap provides free OpenStreetMap-based vector tiles and a
 * MapLibre-compatible dark style. This avoids providers that inject
 * "API key required" tiles into the map.
 */
export const honeybadgerMapStyle =
  'https://tiles.openfreemap.org/styles/dark' as unknown as StyleSpecification;
