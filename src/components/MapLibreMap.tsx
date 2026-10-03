import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { honeybadgerMapStyle } from '@/lib/mapStyle';
import { buildGeoJSON, buildZoneGeoJSON, type MapFeature } from '@/lib/mapData';
import { createCampaignMarker, createClusterMarker, createUserMarker } from '@/lib/mapMarkers';

interface Props {
  features: MapFeature[];
  userLocation: { lng: number; lat: number } | null;
  onMarkerClick: (feature: MapFeature) => void;
  onMapClick: () => void;
}

export function MapLibreMap({ features, userLocation, onMarkerClick, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const clustersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const featuresRef = useRef<MapFeature[]>(features);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const hasAnimatedRef = useRef(false);

  // Keep refs current
  featuresRef.current = features;
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = userLocation
      ? [userLocation.lng, userLocation.lat]
      : [80.2707, 13.0827]; // Chennai

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: honeybadgerMapStyle,
      center,
      zoom: 12,
      maxZoom: 18,
      minZoom: 3,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      // Add GeoJSON source with clustering
      const geojson = buildGeoJSON(featuresRef.current);
      map.addSource('campaigns', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 15,
      });

      // Add zone source
      const zoneGeo = buildZoneGeoJSON(featuresRef.current);
      map.addSource('zones', { type: 'geojson', data: zoneGeo });

      // Zone fill layer — subtle gold circles
      map.addLayer({
        id: 'zone-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': '#D4AF37',
          'fill-opacity': ['case',
            ['==', ['get', 'isScanned'], 1],
            0.03,
            0.06,
          ],
        },
      });

      // Zone boundary — thin gold line
      map.addLayer({
        id: 'zone-line',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': '#D4AF37',
          'line-width': 1,
          'line-opacity': ['case',
            ['==', ['get', 'isScanned'], 1],
            0.12,
            0.25,
          ],
          'line-dasharray': [2, 2],
        },
      });

      // Circle layer for individual markers (visible when not clustered)
      // This is a subtle base circle behind HTML markers
      map.addLayer({
        id: 'marker-halo',
        type: 'circle',
        source: 'campaigns',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 22,
          'circle-color': '#D4AF37',
          'circle-opacity': ['case',
            ['==', ['get', 'isScanned'], 1],
            0,
            0.08,
          ],
          'circle-blur': 1,
        },
      });

      updateMarkers();
    });

    map.on('click', () => {
      onMapClickRef.current();
    });

    map.on('moveend', () => {
      updateMarkers();
    });

    mapRef.current = map;

    // Auto-fit to all markers on first load
    map.on('idle', () => {
      if (!hasAnimatedRef.current && featuresRef.current.length > 0) {
        hasAnimatedRef.current = true;
        const bounds = new maplibregl.LngLatBounds();
        featuresRef.current.forEach((f) => {
          bounds.extend([f.location.longitude, f.location.latitude]);
        });
        if (userLocation) bounds.extend([userLocation.lng, userLocation.lat]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 1200 });
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      clustersRef.current.forEach((m) => m.remove());
      if (userMarkerRef.current) userMarkerRef.current.remove();
      markersRef.current.clear();
      clustersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when features change
  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const featuresData = featuresRef.current;
    if (featuresData.length === 0) return;

    // Query rendered features from the GeoJSON source
    const source = map.getSource('campaigns') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    // Get all features visible in current viewport
    const visible = map.queryRenderedFeatures(undefined, {
      layers: ['marker-halo'],
    });

    // Also check for clusters
    const clusters = map.queryRenderedFeatures(undefined, {
      sources: ['campaigns'],
    }).filter((f) => f.properties?.cluster_id !== undefined);

    // Track which marker IDs are currently visible
    const newMarkerIds = new Set<string>();
    const newClusterIds = new Set<string>();

    // Handle clusters
    const oldClusters = clustersRef.current;
    oldClusters.forEach((m, id) => {
      if (!newClusterIds.has(id)) {
        m.remove();
        oldClusters.delete(id);
      }
    });

    for (const cluster of clusters) {
      const cid = cluster.properties.cluster_id as number;
      const clusterId = `cluster-${cid}`;
      if (clustersRef.current.has(clusterId)) {
        newClusterIds.add(clusterId);
        continue;
      }

      const geom = cluster.geometry as GeoJSON.Point;
      const count = cluster.properties.point_count as number;
      const marker = createClusterMarker(
        map,
        geom.coordinates[0],
        geom.coordinates[1],
        count,
        () => {
          const src = map.getSource('campaigns') as maplibregl.GeoJSONSource;
          src.getClusterExpansionZoom(cid).then((zoom) => {
            map.easeTo({
              center: geom.coordinates as [number, number],
              zoom: zoom + 0.5,
              duration: 600,
            });
          });
        },
      );
      clustersRef.current.set(clusterId, marker);
      newClusterIds.add(clusterId);
    }

    // Remove stale cluster markers
    clustersRef.current.forEach((m, id) => {
      if (!newClusterIds.has(id)) {
        m.remove();
        clustersRef.current.delete(id);
      }
    });

    // Handle individual markers
    const oldMarkers = markersRef.current;
    for (const vf of visible) {
      const id = vf.properties?.id as string;
      if (!id) continue;
      newMarkerIds.add(id);

      if (oldMarkers.has(id)) continue;

      const feature = featuresData.find((f) => f.id === id);
      if (!feature) continue;

      const marker = createCampaignMarker(
        map,
        feature.location.longitude,
        feature.location.latitude,
        feature.category,
        feature.isScanned,
        () => {
          onMarkerClickRef.current(feature);
          map.flyTo({
            center: [feature.location.longitude, feature.location.latitude],
            zoom: Math.max(map.getZoom(), 15),
            duration: 800,
            essential: true,
          });
        },
      );
      oldMarkers.set(id, marker);
    }

    // Remove markers that are no longer visible
    oldMarkers.forEach((m, id) => {
      if (!newMarkerIds.has(id)) {
        m.remove();
        oldMarkers.delete(id);
      }
    });
  }, []);

  // Update GeoJSON data when features change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('campaigns') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(buildGeoJSON(features));
    }

    const zoneSource = map.getSource('zones') as maplibregl.GeoJSONSource | undefined;
    if (zoneSource) {
      zoneSource.setData(buildZoneGeoJSON(features));
    }

    // Clear old markers and re-render
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    updateMarkers();
  }, [features, updateMarkers]);

  // Update user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const { marker } = createUserMarker(map, userLocation.lng, userLocation.lat);
      userMarkerRef.current = marker;
    }
  }, [userLocation]);

  // Expose flyTo for parent component via ref-like callback
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    // Re-fit bounds when user location first becomes available
    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      const bounds = new maplibregl.LngLatBounds();
      featuresRef.current.forEach((f) => {
        bounds.extend([f.location.longitude, f.location.latitude]);
      });
      bounds.extend([userLocation.lng, userLocation.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 1200 });
    }
  }, [userLocation]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
