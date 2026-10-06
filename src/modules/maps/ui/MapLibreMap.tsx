import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre GL JS v6 requires an explicit worker URL when bundled by Vite.
setWorkerUrl(workerUrl);

import { honeybadgerMapStyle, honeycombBuildingLayer } from '@/modules/maps/logic/mapStyle';
import type { MapFeature } from '@/modules/maps/logic/mapData';
import type { Scan } from '@/modules/maps/types';
import { createCampaignMarker, createUserMarker } from '@/lib/mapMarkers';

interface Props {
  features: MapFeature[];
  activityScans: Scan[];
  userLocation: { lng: number; lat: number } | null;
  onMarkerClick: (feature: MapFeature) => void;
  onMapClick: () => void;
}

const CHENNAI: [number, number] = [80.2707, 13.0827];
const ACTIVITY_SOURCE = 'honeycomb-activity-scans';
const ACTIVITY_HEAT = 'honeycomb-activity-heat';
const ACTIVITY_POINTS = 'honeycomb-activity-points';

function buildActivityGeoJSON(scans: Scan[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: scans
      .filter(
        (scan) =>
          Number.isFinite(Number(scan.latitude)) &&
          Number.isFinite(Number(scan.longitude)),
      )
      .map((scan, index) => ({
        type: 'Feature' as const,
        id: scan.id || `scan-${index}`,
        geometry: {
          type: 'Point' as const,
          coordinates: [Number(scan.longitude), Number(scan.latitude)],
        },
        properties: { points: 1, scanId: scan.id },
      })),
  };
}

function add3DBuildings(map: maplibregl.Map) {
  if (map.getLayer(honeycombBuildingLayer.id)) return;

  // OpenFreeMap's vector style uses the OpenMapTiles building source layer.
  // If a provider/style revision ever removes it, simply skip the enhancement
  // and keep the normal 2D map working.
  const style = map.getStyle();
  const hasBuildingSource = Boolean(style.sources?.openmaptiles);
  if (!hasBuildingSource) return;

  try {
    const firstSymbolLayer = style.layers?.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer(honeycombBuildingLayer, firstSymbolLayer);
  } catch {
    // 3D is an enhancement; never let it break the underlying map.
  }
}

export function MapLibreMap({
  features,
  activityScans,
  userLocation,
  onMarkerClick,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasFitRef = useRef(false);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const activityScansRef = useRef(activityScans);

  activityScansRef.current = activityScans;
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: honeybadgerMapStyle,
      center: CHENNAI,
      zoom: 12,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: false,
      pitch: 48,
      bearing: 0,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
    });

    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('click', () => onMapClickRef.current());
    mapRef.current = map;

    const addActivityLayers = () => {
      add3DBuildings(map);

      if (!map.getSource(ACTIVITY_SOURCE)) {
        map.addSource(ACTIVITY_SOURCE, {
          type: 'geojson',
          data: buildActivityGeoJSON(activityScansRef.current),
        });
      }

      if (!map.getLayer(ACTIVITY_HEAT)) {
        map.addLayer(
          {
            id: ACTIVITY_HEAT,
            type: 'heatmap',
            source: ACTIVITY_SOURCE,
            maxzoom: 11,
            paint: {
              'heatmap-weight': 1,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 2.4, 11, 3.2],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 16, 6, 28, 9, 42, 11, 55],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.92, 10, 0.82, 11, 0.35],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(232,62,140,0)',
                0.15, 'rgba(139,92,246,0.28)',
                0.35, 'rgba(232,62,140,0.55)',
                0.55, 'rgba(255,107,74,0.72)',
                0.75, 'rgba(255,200,87,0.88)',
                1, 'rgba(255,255,255,0.98)',
              ],
            },
          },
          map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id,
        );
      }

      if (!map.getLayer(ACTIVITY_POINTS)) {
        map.addLayer({
          id: ACTIVITY_POINTS,
          type: 'circle',
          source: ACTIVITY_SOURCE,
          minzoom: 8.5,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8.5, 2.5, 12, 5, 16, 7],
            'circle-color': '#E50914',
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 0.2, 10, 0.5, 12, 0.82],
            'circle-stroke-color': 'rgba(255,255,255,0.8)',
            'circle-stroke-width': 1,
          },
        });
      }

      const source = map.getSource(ACTIVITY_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(buildActivityGeoJSON(activityScansRef.current));
    };

    map.once('load', addActivityLayers);

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      hasFitRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const source = map.getSource(ACTIVITY_SOURCE) as maplibregl.GeoJSONSource | undefined;
      source?.setData(buildActivityGeoJSON(activityScans));
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [activityScans]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const markers = features.map((feature) =>
      createCampaignMarker(
        map,
        feature.location.longitude,
        feature.location.latitude,
        feature.category,
        feature.isScanned,
        () => {
          onMarkerClickRef.current(feature);
          map.easeTo({
            center: [feature.location.longitude, feature.location.latitude],
            zoom: Math.max(map.getZoom(), 14),
            pitch: 55,
            duration: 600,
          });
        },
      ),
    );

    return () => markers.forEach((marker) => marker.remove());
  }, [features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const activityPoints = activityScans
      .filter((scan) => Number.isFinite(Number(scan.latitude)) && Number.isFinite(Number(scan.longitude)))
      .map((scan) => [Number(scan.longitude), Number(scan.latitude)] as [number, number]);
    const locationPoints = features.map((feature) => [feature.location.longitude, feature.location.latitude] as [number, number]);
    const points = [...activityPoints, ...locationPoints];
    if (userLocation) points.push([userLocation.lng, userLocation.lat]);
    if (!points.length || hasFitRef.current) return;

    hasFitRef.current = true;
    const bounds = points.reduce(
      (bounds, point) => bounds.extend(point),
      new maplibregl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, { padding: 70, maxZoom: 11, pitch: 48, duration: 700 });
  }, [activityScans, features, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = createUserMarker(map, userLocation.lng, userLocation.lat).marker;
  }, [userLocation]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
