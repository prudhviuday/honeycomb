import type { Location, InteractionSource, Scan } from '@/types';

export type MarkerCategory = 'activation' | 'reward' | 'mission' | 'venue';

export interface MapFeature {
  id: string;
  category: MarkerCategory;
  location: Location;
  sources: InteractionSource[];
  totalPoints: number;
  isScanned: boolean;
}

/**
 * Convert campaign data into GeoJSON FeatureCollection for MapLibre.
 */
export function buildGeoJSON(features: MapFeature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature' as const,
      id: f.id,
      geometry: {
        type: 'Point',
        coordinates: [f.location.longitude, f.location.latitude],
      },
      properties: {
        id: f.id,
        category: f.category,
        name: f.location.name,
        address: f.location.address,
        totalPoints: f.totalPoints,
        isScanned: f.isScanned ? 1 : 0,
        sourceCount: f.sources.length,
      },
    })),
  };
}

/**
 * Build circular activation zone GeoJSON for locations that have sources.
 */
export function buildZoneGeoJSON(features: MapFeature[]): GeoJSON.FeatureCollection {
  const radiusInKm = 0.4;
  return {
    type: 'FeatureCollection',
    features: features
      .filter((f) => f.sources.length > 0)
      .map((f) => {
        const center = [f.location.longitude, f.location.latitude];
        const coords: number[][] = [];
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const angle = (i / steps) * 2 * Math.PI;
          const dx = (radiusInKm / 111.32) * Math.cos(angle);
          const dy = (radiusInKm / 110.57) * Math.sin(angle);
          coords.push([center[0] + dx, center[1] + dy]);
        }
        return {
          type: 'Feature' as const,
          properties: {
            id: f.id,
            isScanned: f.isScanned ? 1 : 0,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
        };
      }),
  };
}

/**
 * Convert campaign locations + sources + scans into MapFeature list.
 */
export function buildMapFeatures(
  locations: Location[],
  sources: InteractionSource[],
  scans: Scan[],
): MapFeature[] {
  const scannedSourceIds = new Set(scans.map((s) => s.interaction_source_id));
  const categoryMap: Record<string, MarkerCategory> = {
    mall: 'activation',
    beach: 'venue',
    park: 'venue',
    market: 'venue',
    transit: 'venue',
    neighborhood: 'venue',
    general: 'mission',
  };

  return locations.map((loc) => {
    const locSources = sources.filter((s) => s.location_id === loc.id);
    const totalPoints = locSources.reduce((sum, s) => sum + s.points, 0);
    const isScanned = locSources.some((s) => scannedSourceIds.has(s.id));
    const category: MarkerCategory = categoryMap[loc.category] ?? 'venue';
    return {
      id: loc.id,
      category,
      location: loc,
      sources: locSources,
      totalPoints,
      isScanned,
    };
  });
}

/**
 * Calculate distance between two coordinates in km (Haversine).
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)} km away`;
}
