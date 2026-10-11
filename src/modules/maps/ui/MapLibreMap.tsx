import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

import {
  honeybadgerMapStyle,
  honeycombBuildingLayer,
} from "@/modules/maps/logic/mapStyle";
import type { MapFeature } from "@/modules/maps/logic/mapData";
import type { Scan, HeatmapPoint } from "@/modules/maps/types";
import { createCampaignMarker, createUserMarker } from "@/lib/mapMarkers";

interface Props {
  features: MapFeature[];
  activityScans: Scan[];
  generalHeatmap: HeatmapPoint[];
  campaignHeatmap: HeatmapPoint[];
  userLocation: { lng: number; lat: number } | null;
  onMarkerClick: (feature: MapFeature) => void;
  onMapClick: () => void;
  recenterVersion?: number;
  fitActivity?: boolean;
  fitFeatures?: boolean;
  fitHeatmapVersion?: number;
  heatIntensityScale?: number;
  zoomFalloffSpeed?: number;
  heatRadiusScale?: number;
}

const CHENNAI: [number, number] = [80.2707, 13.0827];
const DETAILED_MAX_ZOOM = 18;
const GENERAL_HEAT_SOURCE = "honeycomb-general-location-heat";
const CAMPAIGN_HEAT_SOURCE = "honeycomb-campaign-location-heat";
const GENERAL_HEAT_LAYER = "honeycomb-general-location-heat-layer";
const CAMPAIGN_HEAT_LAYER = "honeycomb-campaign-location-heat-layer";

function buildHeatmapGeoJSON(points: HeatmapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points
      .filter(
        (point) =>
          Number.isFinite(Number(point.latitude)) &&
          Number.isFinite(Number(point.longitude)) &&
          Number.isFinite(Number(point.weight)),
      )
      .map((point, index) => ({
        type: "Feature" as const,
        id: `heat-${index}-${point.latitude}-${point.longitude}`,
        geometry: {
          type: "Point" as const,
          coordinates: [Number(point.longitude), Number(point.latitude)],
        },
        properties: { weight: Number(point.weight) },
      })),
  };
}

function refreshHeatmapSources(
  map: maplibregl.Map,
  generalHeatmap: HeatmapPoint[],
  campaignHeatmap: HeatmapPoint[],
) {
  (map.getSource(GENERAL_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(generalHeatmap));
  (map.getSource(CAMPAIGN_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(campaignHeatmap));
}

type ScanWithCoordinates = Scan & {
  latitude?: number | null;
  longitude?: number | null;
};

function buildActivityGeoJSON(scans: Scan[]): GeoJSON.FeatureCollection {
  const scansWithCoordinates = scans as ScanWithCoordinates[];
  return {
    type: "FeatureCollection",
    features: scansWithCoordinates
      .filter(
        (scan) =>
          scan.latitude != null &&
          scan.longitude != null &&
          Number.isFinite(Number(scan.latitude)) &&
          Number.isFinite(Number(scan.longitude)),
      )
      .map((scan, index) => ({
        type: "Feature" as const,
        id: scan.id || `scan-${index}`,
        geometry: {
          type: "Point" as const,
          coordinates: [Number(scan.longitude), Number(scan.latitude)],
        },
        properties: { points: 1, scanId: scan.id },
      })),
  };
}

const GENERAL_INTENSITY_STOPS: Array<[number, number]> = [
  [2, 0.18], [5, 0.28], [6, 0.36], [8, 0.55], [11, 0.82], [14, 1.12], [18, 1.45],
];
const CAMPAIGN_INTENSITY_STOPS: Array<[number, number]> = [
  [2, 0.16], [5, 0.26], [6, 0.34], [8, 0.52], [11, 0.78], [14, 1.05], [18, 1.34],
];

function buildIntensityExpression(
  stops: Array<[number, number]>,
  scale: number,
  falloffSpeed: number,
): maplibregl.ExpressionSpecification {
  const adjustedStops: (number | string)[] = [];
  const normalizedScale = Math.max(0, Math.min(5, scale));
  const effectiveFalloffSpeed = 0.4 + Math.max(0, Math.min(1, falloffSpeed)) * 2.4;
  for (const [zoom, baseIntensity] of stops) {
    const zoomProgress = Math.max(0, Math.min(1, zoom / DETAILED_MAX_ZOOM));
    const lowZoomReduction = 0.48 * Math.pow(1 - zoomProgress, effectiveFalloffSpeed);
    adjustedStops.push(zoom, Number((baseIntensity * normalizedScale * (1 - lowZoomReduction)).toFixed(3)));
  }
  return ["interpolate", ["linear"], ["zoom"], ...adjustedStops] as maplibregl.ExpressionSpecification;
}

function buildRadiusExpression(stops: Array<[number, number]>, radiusScale: number): maplibregl.ExpressionSpecification {
  const multiplier = 0.2 + Math.max(0, Math.min(1, radiusScale)) * 2.8;
  const adjustedStops: (number | string)[] = [];
  for (const [zoom, radius] of stops) adjustedStops.push(zoom, Number((radius * multiplier).toFixed(2)));
  return ["interpolate", ["linear"], ["zoom"], ...adjustedStops] as maplibregl.ExpressionSpecification;
}

function applyHeatmapControls(map: maplibregl.Map, scale: number, falloffSpeed: number, radiusScale: number) {
  if (map.getLayer(GENERAL_HEAT_LAYER)) {
    map.setPaintProperty(GENERAL_HEAT_LAYER, "heatmap-intensity", buildIntensityExpression(GENERAL_INTENSITY_STOPS, scale * 5, falloffSpeed));
    map.setPaintProperty(GENERAL_HEAT_LAYER, "heatmap-radius", buildRadiusExpression([[2, 12], [5, 20], [6, 28], [8, 40], [11, 58], [14, 78], [18, 96]], radiusScale));
  }
  if (map.getLayer(CAMPAIGN_HEAT_LAYER)) {
    map.setPaintProperty(CAMPAIGN_HEAT_LAYER, "heatmap-intensity", buildIntensityExpression(CAMPAIGN_INTENSITY_STOPS, scale * 5, falloffSpeed));
    map.setPaintProperty(CAMPAIGN_HEAT_LAYER, "heatmap-radius", buildRadiusExpression([[2, 10], [5, 18], [6, 24], [8, 36], [11, 50], [14, 66], [18, 82]], radiusScale));
  }
}

function addHeatmapLayers(
  map: maplibregl.Map,
  generalHeatmap: HeatmapPoint[],
  campaignHeatmap: HeatmapPoint[],
  heatIntensityScale: number,
  zoomFalloffSpeed: number,
) {
  if (!map.getSource(GENERAL_HEAT_SOURCE)) {
    map.addSource(GENERAL_HEAT_SOURCE, {
      type: "geojson",
      data: buildHeatmapGeoJSON(generalHeatmap),
    });
  }

  if (!map.getSource(CAMPAIGN_HEAT_SOURCE)) {
    map.addSource(CAMPAIGN_HEAT_SOURCE, {
      type: "geojson",
      data: buildHeatmapGeoJSON(campaignHeatmap),
    });
  }
  const firstSymbolLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;

  if (!map.getLayer(GENERAL_HEAT_LAYER)) {
    map.addLayer(
      {
        id: GENERAL_HEAT_LAYER,
        type: "heatmap",
        source: GENERAL_HEAT_SOURCE,
        minzoom: 2,
        maxzoom: DETAILED_MAX_ZOOM,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            0.3,
            3,
            0.55,
            8,
            0.8,
            20,
            1,
          ],
          "heatmap-intensity": buildIntensityExpression(GENERAL_INTENSITY_STOPS, heatIntensityScale * 5, zoomFalloffSpeed),
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 5, 20, 6, 28, 8, 40, 11, 58, 14, 78, 18, 96],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.46,
            6,
            0.50,
            10,
            0.53,
            14,
            0.56,
            18,
            0.60,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(45,125,255,0)",
            0.20, "rgba(45,125,255,0.20)",
            0.30, "rgba(0,190,255,0.42)",
            0.50, "rgba(0,215,135,0.58)",
            0.70, "rgba(255,224,55,0.70)",
            0.80, "rgba(255,143,35,0.80)",
            1, "rgba(245,65,55,0.92)"
          ],
        },
      },
      firstSymbolLayer,
    );
  }

  if (!map.getLayer(CAMPAIGN_HEAT_LAYER)) {
    map.addLayer(
      {
        id: CAMPAIGN_HEAT_LAYER,
        type: "heatmap",
        source: CAMPAIGN_HEAT_SOURCE,
        minzoom: 2,
        maxzoom: DETAILED_MAX_ZOOM,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            0.55,
            5,
            1,
            20,
            1,
          ],
          "heatmap-intensity": buildIntensityExpression(CAMPAIGN_INTENSITY_STOPS, heatIntensityScale * 5, zoomFalloffSpeed),
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 10, 5, 18, 6, 24, 8, 36, 11, 50, 14, 66, 18, 82],
          "heatmap-opacity": [
            "interpolate", ["linear"], ["zoom"],
            5.5, 0.42,
            8, 0.50,
            12, 0.58,
            18, 0.64,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(35,125,255,0)",
            0.20, "rgba(35,125,255,0.24)",
            0.30, "rgba(0,190,255,0.48)",
            0.50, "rgba(0,215,135,0.64)",
            0.70, "rgba(255,224,55,0.76)",
            0.80, "rgba(255,143,35,0.86)",
            1, "rgba(190,20,45,0.96)"
          ],
        },
      },
      firstSymbolLayer,
    );
  }

  refreshHeatmapSources(map, generalHeatmap, campaignHeatmap);
}

function add3DBuildings(map: maplibregl.Map) {
  if (map.getLayer(honeycombBuildingLayer.id)) return;

  const style = map.getStyle();
  const hasBuildingSource = Boolean(style.sources?.openmaptiles);
  if (!hasBuildingSource) return;

  try {
    const firstSymbolLayer = style.layers?.find(
      (layer) => layer.type === "symbol",
    )?.id;
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
  fitActivity = false,
  fitFeatures = false,
  fitHeatmapVersion = 0,
  heatIntensityScale = 1,
  zoomFalloffSpeed = 1 / 3,
  heatRadiusScale = 2 / 7,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const activityScansRef = useRef(activityScans);
  const generalHeatmapRef = useRef(generalHeatmap);
  const campaignHeatmapRef = useRef(campaignHeatmap);
  const hasInitializedLocationRef = useRef(false);
  const lastFitHeatmapVersionRef = useRef(0);

  activityScansRef.current = activityScans;
  generalHeatmapRef.current = generalHeatmap;
  campaignHeatmapRef.current = campaignHeatmap;
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: honeybadgerMapStyle,
      center: userLocation ? [userLocation.lng, userLocation.lat] : CHENNAI,
      zoom: userLocation ? 12 : 6,
      minZoom: 2,
      maxZoom: 20,
      maxPitch: 60,
      attributionControl: false,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.touchZoomRotate.disableRotation();
    map.on("zoomend", () => {
      refreshHeatmapSources(map, generalHeatmapRef.current, campaignHeatmapRef.current);
      const zoom = map.getZoom();
      const targetPitch = zoom >= 15 ? 48 : zoom >= 13 ? 34 : zoom < 10 ? 0 : 12;
      if (Math.abs(map.getPitch() - targetPitch) > 8) {
        map.easeTo({ pitch: targetPitch, duration: 420 });
      }
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.on("click", () => onMapClickRef.current());
    mapRef.current = map;

    const addActivityLayers = () => {
      // Keep the normal map intact; the neon effect is produced by luminous
      // point halos drawn over the map, not by recoloring the road network.
      add3DBuildings(map);
      addHeatmapLayers(map, generalHeatmap, campaignHeatmap, heatIntensityScale, zoomFalloffSpeed);
    };

    map.once("load", addActivityLayers);

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyWhenReady = () => applyHeatmapControls(map, heatIntensityScale, zoomFalloffSpeed, heatRadiusScale);
    if (map.isStyleLoaded()) applyWhenReady();
    else map.once("load", applyWhenReady);
    return () => {
      map.off("load", applyWhenReady);
    };
  }, [heatIntensityScale, zoomFalloffSpeed, heatRadiusScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => refreshHeatmapSources(map, generalHeatmap, campaignHeatmap);
    if (Boolean(map.getSource(GENERAL_HEAT_SOURCE))) update();
    else map.once("load", update);
    return () => {
      map.off("load", update);
    };
  }, [activityScans, generalHeatmap, campaignHeatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let markers: maplibregl.Marker[] = [];
    const addMarkers = () => {
      markers = features.map((feature) =>
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
    };
    if (Boolean(map.getSource(GENERAL_HEAT_SOURCE))) addMarkers();
    else map.once("load", addMarkers);
    return () => {
      map.off("load", addMarkers);
      markers.forEach((marker) => marker.remove());
    };
  }, [features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    if (!userLocation) {
      userMarkerRef.current = null;
      return;
    }
    userMarkerRef.current = createUserMarker(
      map,
      userLocation.lng,
      userLocation.lat,
    ).marker;
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

    if (Boolean(map.getSource(GENERAL_HEAT_SOURCE))) centerOnUser();
    else map.once("load", centerOnUser);

    return () => {
      map.off("load", centerOnUser);
    };
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || !Boolean(map.getSource(GENERAL_HEAT_SOURCE)))
      return;

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
    if (
      !map ||
      fitHeatmapVersion <= lastFitHeatmapVersionRef.current ||
      !campaignHeatmap.length
    ) return;
    lastFitHeatmapVersionRef.current = fitHeatmapVersion;

    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();
      campaignHeatmap.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 48,
          maxZoom: 5.2,
          duration: 900,
        });
      }
    };

    if (Boolean(map.getSource(GENERAL_HEAT_SOURCE))) fit();
    else map.once("load", fit);

    return () => {
      map.off("load", fit);
    };
  }, [campaignHeatmap, fitHeatmapVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitActivity || !campaignHeatmap.length) return;
    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();
      campaignHeatmap.forEach((p) => bounds.extend([p.longitude, p.latitude]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 400 });
    };
    if (Boolean(map.getSource(GENERAL_HEAT_SOURCE))) fit();
    else map.once("load", fit);
    return () => {
      map.off("load", fit);
    };
  }, [campaignHeatmap, fitActivity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitFeatures || !features.length) return;

    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();

      features.forEach((feature) => {
        bounds.extend([
          feature.location.longitude,
          feature.location.latitude,
        ]);
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 44,
          maxZoom: 13.5,
          duration: 500,
        });
      }
    };

    if (Boolean(map.getSource(GENERAL_HEAT_SOURCE))) fit();
    else map.once("load", fit);

    return () => {
      map.off("load", fit);
    };
  }, [features, fitFeatures]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
