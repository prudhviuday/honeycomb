import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

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
  // Strava-like visual treatment: use the actual transportation geometry
  // from the loaded OpenFreeMap style, with a soft orange glow and a bright
  // orange core. The layers are deliberately placed ABOVE the source road
  // layer; putting them below it lets the original dark road paint hide them.
  const styleLayers = map.getStyle().layers ?? [];
  const roadLayers = styleLayers.filter(
    (layer) =>
      layer.type === 'line' &&
      layer.source === 'openmaptiles' &&
      layer['source-layer'] === 'transportation',
  );

  roadLayers.forEach((roadLayer, index) => {
    const glowId = `honeycomb-road-glow-${index}`;
    const coreId = `honeycomb-road-core-${index}`;

    const common = {
      source: 'openmaptiles',
      'source-layer': 'transportation',
      ...(roadLayer.minzoom !== undefined ? { minzoom: roadLayer.minzoom } : {}),
      ...(roadLayer.maxzoom !== undefined ? { maxzoom: roadLayer.maxzoom } : {}),
      ...(roadLayer.filter ? { filter: roadLayer.filter } : {}),
    };

    // Put the glow immediately ABOVE the source transportation layer.
    // This is the key fix for the previously invisible orange effect.
    if (!map.getLayer(glowId)) {
      map.addLayer({
        id: glowId,
        type: 'line',
        ...common,
        paint: {
          'line-color': '#00bfff',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            2, 1.5, 5, 2.5, 8, 4, 11, 6, 14, 8, 18, 11,
          ],
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            2, 0.22, 5, 0.30, 8, 0.38, 11, 0.46, 14, 0.52, 18, 0.58,
          ],
          'line-blur': 2.8,
          'line-cap': 'round',
          'line-join': 'round',
        },
      }, roadLayer.id);
    }

    // Add the bright core above the glow.
    if (!map.getLayer(coreId)) {
      map.addLayer({
        id: coreId,
        type: 'line',
        ...common,
        paint: {
          'line-color': '#8ffcff',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            2, 0.45, 5, 0.7, 8, 1.0, 11, 1.35, 14, 1.8, 18, 2.5,
          ],
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            2, 0.65, 5, 0.72, 8, 0.78, 11, 0.82, 14, 0.88, 18, 0.92,
          ],
          'line-cap': 'round',
          'line-join': 'round',
        },
      }, glowId);
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
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.72, 6, 1.0, 8, 1.25, 10, 1.45],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 34, 5, 52, 7, 72, 9, 92, 10, 108],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.56, 6, 0.64, 9, 0.68, 10, 0.62],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.10, 'rgba(0,102,255,0.05)',
              0.22, 'rgba(0,174,255,0.28)',
              0.38, 'rgba(0,235,255,0.52)',
              0.55, 'rgba(92,92,255,0.70)',
              0.72, 'rgba(194,48,255,0.84)',
              0.88, 'rgba(255,35,177,0.94)',
              1, 'rgba(255,238,255,0.98)',
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
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1.1, 11, 1.45, 14, 1.8, 18, 2.1],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 42, 11, 58, 14, 78, 18, 96],
            'heatmap-opacity': 0.78,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,102,255,0)',
              0.12, 'rgba(0,190,255,0.16)',
              0.28, 'rgba(0,225,255,0.36)',
              0.45, 'rgba(84,86,255,0.58)',
              0.62, 'rgba(174,45,255,0.74)',
              0.80, 'rgba(255,35,180,0.90)',
              0.92, 'rgba(255,92,202,0.96)',
              1, 'rgba(255,242,255,1)',
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
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.95, 6, 1.2, 8, 1.5, 11, 1.9],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 28, 6, 44, 9, 62, 11, 76],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.62, 8, 0.68, 10, 0.62, 11, 0.34],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.10, 'rgba(0,102,255,0.05)',
                0.22, 'rgba(0,174,255,0.30)',
                0.38, 'rgba(0,235,255,0.55)',
                0.55, 'rgba(92,92,255,0.72)',
                0.72, 'rgba(194,48,255,0.86)',
                0.88, 'rgba(255,35,177,0.95)',
                1, 'rgba(255,238,255,0.99)',
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
