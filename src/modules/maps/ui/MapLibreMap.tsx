import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre GL JS v6 requires an explicit worker URL when bundled by Vite.
setWorkerUrl(workerUrl);

import { honeybadgerMapStyle, honeycombBuildingLayer } from '@/modules/maps/logic/mapStyle';
import type { MapFeature } from '@/modules/maps/logic/mapData';
import type { Scan, HeatmapPoint } from '@/modules/maps/types';
import { createCampaignMarker, createUserMarker } from '@/lib/mapMarkers';

interface Props {
  features: MapFeature[];
  activityScans: Scan[];
  generalHeatmap: HeatmapPoint[];
  campaignHeatmap: HeatmapPoint[];
  userLocation: { lng: number; lat: number } | null;
  onMarkerClick: (feature: MapFeature) => void;
  onMapClick: () => void;
  recenterVersion?: number;
}

const CHENNAI: [number, number] = [80.2707, 13.0827];
const TAMIL_NADU_BOUNDS = { south: 8.0, north: 13.6, west: 76.2, east: 80.4 };
const REGIONAL_MAX_ZOOM = 8.99;
const DETAILED_MAX_ZOOM = 18;
const ACTIVITY_SOURCE = 'honeycomb-activity-scans';
const ACTIVITY_HEAT = 'honeycomb-activity-heat';
const ACTIVITY_POINTS = 'honeycomb-activity-points';
const GENERAL_HEAT_SOURCE = 'honeycomb-general-location-heat';
const CAMPAIGN_HEAT_SOURCE = 'honeycomb-campaign-location-heat';
const GENERAL_HEAT_LAYER = 'honeycomb-general-location-heat-layer';
const CAMPAIGN_HEAT_LAYER = 'honeycomb-campaign-location-heat-layer';

function buildHeatmapGeoJSON(points: HeatmapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point, index) => ({
      type: 'Feature' as const,
      id: `heat-${index}-${point.latitude}-${point.longitude}`,
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      properties: { weight: point.weight },
    })),
  };
}

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
  generalHeatmap,
  campaignHeatmap,
  userLocation,
  onMarkerClick,
  onMapClick,
  recenterVersion = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const activityScansRef = useRef(activityScans);
  const hasInitializedLocationRef = useRef(false);

  activityScansRef.current = activityScans;
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: honeybadgerMapStyle,
      center: userLocation ? [userLocation.lng, userLocation.lat] : CHENNAI,
      zoom: userLocation ? 12 : 6,
      minZoom: 0,
      maxZoom: userLocation ? DETAILED_MAX_ZOOM : REGIONAL_MAX_ZOOM,
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

      if (!map.getSource(GENERAL_HEAT_SOURCE)) {
        map.addSource(GENERAL_HEAT_SOURCE, { type: 'geojson', data: buildHeatmapGeoJSON(generalHeatmap) });
      }

      if (!map.getSource(CAMPAIGN_HEAT_SOURCE)) {
        map.addSource(CAMPAIGN_HEAT_SOURCE, { type: 'geojson', data: buildHeatmapGeoJSON(campaignHeatmap) });
      }

      if (!map.getLayer(GENERAL_HEAT_LAYER)) {
        map.addLayer({
          id: GENERAL_HEAT_LAYER,
          type: 'heatmap',
          source: GENERAL_HEAT_SOURCE,
          maxzoom: REGIONAL_MAX_ZOOM,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 1, 0.35, 5, 0.8, 20, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1.5, 12, 2.2],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 20, 6, 34, 9, 50, 12, 62],
            'heatmap-opacity': 0.42,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(99,102,241,0)',
              0.25, 'rgba(99,102,241,0.18)',
              0.5, 'rgba(139,92,246,0.35)',
              0.75, 'rgba(236,72,153,0.48)',
              1, 'rgba(255,200,87,0.72)',
            ],
          },
        }, map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id);
      }

      if (!map.getLayer(CAMPAIGN_HEAT_LAYER)) {
        map.addLayer({
          id: CAMPAIGN_HEAT_LAYER,
          type: 'heatmap',
          source: CAMPAIGN_HEAT_SOURCE,
          minzoom: 9,
          maxzoom: DETAILED_MAX_ZOOM,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 1, 0.55, 5, 1, 20, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2, 12, 3],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 18, 6, 30, 9, 46, 12, 58],
            'heatmap-opacity': 0.82,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(232,62,140,0)',
              0.15, 'rgba(139,92,246,0.22)',
              0.35, 'rgba(232,62,140,0.52)',
              0.55, 'rgba(255,107,74,0.72)',
              0.75, 'rgba(255,200,87,0.9)',
              1, 'rgba(255,255,255,0.98)',
            ],
          },
        }, map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id);
      }

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
      (map.getSource(GENERAL_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(generalHeatmap));
      (map.getSource(CAMPAIGN_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(campaignHeatmap));
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
      (map.getSource(ACTIVITY_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildActivityGeoJSON(activityScans));
      (map.getSource(GENERAL_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(generalHeatmap));
      (map.getSource(CAMPAIGN_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(campaignHeatmap));
    };
    if (map.isStyleLoaded()) update(); else map.once('load', update);
  }, [activityScans, generalHeatmap, campaignHeatmap]);

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
    if (!map || !userLocation) return;

    userMarkerRef.current?.remove();
    userMarkerRef.current = createUserMarker(map, userLocation.lng, userLocation.lat).marker;
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || hasInitializedLocationRef.current) return;

    const centerOnUser = () => {
      if (hasInitializedLocationRef.current) return;
      hasInitializedLocationRef.current = true;
      map.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 12,
        pitch: 48,
        duration: 650,
      });
    };

    if (map.isStyleLoaded()) centerOnUser();
    else map.once('load', centerOnUser);

    return () => map.off('load', centerOnUser);
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || !map.isStyleLoaded()) return;

    map.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: Math.max(map.getZoom(), 12),
      pitch: 48,
      duration: 650,
    });
  }, [recenterVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const isInsideTamilNadu = (lng: number, lat: number) =>
      lat >= TAMIL_NADU_BOUNDS.south &&
      lat <= TAMIL_NADU_BOUNDS.north &&
      lng >= TAMIL_NADU_BOUNDS.west &&
      lng <= TAMIL_NADU_BOUNDS.east;

    const updateMapMode = () => {
      const center = map.getCenter();
      const centerInsideTamilNadu =
        center.lat >= TAMIL_NADU_BOUNDS.south &&
        center.lat <= TAMIL_NADU_BOUNDS.north &&
        center.lng >= TAMIL_NADU_BOUNDS.west &&
        center.lng <= TAMIL_NADU_BOUNDS.east;

      // Outside Tamil Nadu, the map is intentionally capped at regional zoom.
      // Once the viewport is centered in Tamil Nadu, detailed zoom is unlocked.
      const maxZoom = centerInsideTamilNadu ? DETAILED_MAX_ZOOM : REGIONAL_MAX_ZOOM;
      if (map.getMaxZoom() !== maxZoom) map.setMaxZoom(maxZoom);
    };

    if (map.isStyleLoaded()) updateMapMode();
    else map.once('load', updateMapMode);
    map.on('moveend', updateMapMode);
    map.on('zoomend', updateMapMode);
    return () => {
      map.off('load', updateMapMode);
      map.off('moveend', updateMapMode);
      map.off('zoomend', updateMapMode);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;