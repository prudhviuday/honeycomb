import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

import { honeybadgerMapStyle, honeycombBuildingLayer, honeycombRoadGlowLayers } from '@/modules/maps/logic/mapStyle';
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

function addRoadGlow(map: maplibregl.Map) {
  // Strava's heatmap look is fundamentally line-based: aggregated activity
  // traces are drawn along ways, rather than painting the OSM roads themselves.
  // Our current data is point-based, so for the visual treatment we reuse the
  // exact transportation layers already supplied by OpenFreeMap and add glow
  // passes using each layer's real filter/zoom range. This avoids the previous
  // problem where a guessed source-layer/class combination disappeared.
  const styleLayers = map.getStyle().layers ?? [];
  const roadLayers = styleLayers.filter(
    (layer) =>
      layer.type === 'line' &&
      layer.source === 'openmaptiles' &&
      layer['source-layer'] === 'transportation',
  );

  if (!roadLayers.length) return;

  roadLayers.forEach((roadLayer, index) => {
    const glowId = `honeycomb-road-glow-${index}`;
    const coreId = `honeycomb-road-core-${index}`;

    if (!map.getLayer(glowId)) {
      map.addLayer(
        {
          id: glowId,
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          ...(roadLayer.minzoom !== undefined ? { minzoom: roadLayer.minzoom } : {}),
          ...(roadLayer.maxzoom !== undefined ? { maxzoom: roadLayer.maxzoom } : {}),
          ...(roadLayer.filter ? { filter: roadLayer.filter } : {}),
          paint: {
            'line-color': '#ff6a24',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 2,
              6, 3,
              9, 4.5,
              12, 6,
              16, 8,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 0.20,
              6, 0.27,
              9, 0.34,
              12, 0.42,
              16, 0.50,
            ],
            'line-blur': 2.4,
            'line-cap': 'round',
            'line-join': 'round',
          },
        },
        roadLayer.id,
      );
    }

    if (!map.getLayer(coreId)) {
      map.addLayer(
        {
          id: coreId,
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'transportation',
          ...(roadLayer.minzoom !== undefined ? { minzoom: roadLayer.minzoom } : {}),
          ...(roadLayer.maxzoom !== undefined ? { maxzoom: roadLayer.maxzoom } : {}),
          ...(roadLayer.filter ? { filter: roadLayer.filter } : {}),
          paint: {
            'line-color': '#ffad5a',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 0.45,
              6, 0.75,
              9, 1.1,
              12, 1.55,
              16, 2.2,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 0.42,
              6, 0.50,
              9, 0.60,
              12, 0.70,
              16, 0.82,
            ],
            'line-cap': 'round',
            'line-join': 'round',
          },
        },
        roadLayer.id,
      );
    }
  });
}

function add3DBuildings(map: maplibregl.Map) {
  if (map.getLayer(honeycombBuildingLayer.id)) return;

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
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('click', () => onMapClickRef.current());
    mapRef.current = map;

    const addActivityLayers = () => {
      // Put buildings below the luminous road network so close-up extrusions
      // cannot visually swallow the smaller glowing roads.
      add3DBuildings(map);
      addRoadGlow(map);

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
          maxzoom: 10,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 1, 0.28, 3, 0.5, 8, 0.78, 20, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.65, 6, 0.9, 8, 1.15, 10, 1.35],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 34, 5, 52, 7, 72, 9, 92, 10, 108],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.58, 9, 0.62, 10, 0.58],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.12, 'rgba(82,45,110,0.10)',
              0.28, 'rgba(116,55,94,0.18)',
              0.48, 'rgba(196,72,48,0.30)',
              0.68, 'rgba(244,116,45,0.48)',
              0.84, 'rgba(255,174,63,0.70)',
              1, 'rgba(255,225,150,0.92)',
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
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1.05, 11, 1.35, 14, 1.7, 18, 2.0],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 42, 11, 58, 14, 78, 18, 96],
            'heatmap-opacity': 0.72,
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
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.9, 6, 1.15, 8, 1.45, 11, 1.8],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 28, 6, 44, 9, 62, 11, 76],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.58, 8, 0.62, 10, 0.58, 11, 0.3],
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
        pitch: 0,
        bearing: 0,
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
      pitch: 0,
      bearing: 0,
      duration: 650,
    });
  }, [recenterVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMapMode = () => {
      const center = map.getCenter();
      const centerInsideTamilNadu =
        center.lat >= TAMIL_NADU_BOUNDS.south &&
        center.lat <= TAMIL_NADU_BOUNDS.north &&
        center.lng >= TAMIL_NADU_BOUNDS.west &&
        center.lng <= TAMIL_NADU_BOUNDS.east;

      const maxZoom = centerInsideTamilNadu ? DETAILED_MAX_ZOOM : REGIONAL_MAX_ZOOM;
      if (map.getMaxZoom() !== maxZoom) {
        map.setMaxZoom(maxZoom);
      }
    };

    if (map.isStyleLoaded()) {
      updateMapMode();
    } else {
      map.once('load', updateMapMode);
    }

    map.on('moveend', updateMapMode);
    map.on('zoomend', updateMapMode);

    return () => {
      map.off('load', updateMapMode);
      map.off('moveend', updateMapMode);
      map.off('zoomend', updateMapMode);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
