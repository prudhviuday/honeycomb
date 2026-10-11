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

function addAggregatedGridLayer(
  map: maplibregl.Map,
  source: string,
  layer: string,
  beforeId?: string,
) {
  if (map.getLayer(layer)) return;
  map.addLayer({
    id: layer,
    type: "circle",
    source,
    minzoom: 2,
    maxzoom: GRID_MAX_ZOOM,
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, ["interpolate", ["linear"], ["get", "count"], 1, 3, 3, 4.5, 8, 6.5, 16, 8],
        4, ["interpolate", ["linear"], ["get", "count"], 1, 4, 3, 6, 8, 8, 16, 10],
        5.5, ["interpolate", ["linear"], ["get", "count"], 1, 5, 3, 7, 8, 10, 16, 12],
      ],
      "circle-color": [
        "step", ["get", "count"],
        "#3288ff",
        2, "#00bfff",
        4, "#00d78f",
        7, "#ffe037",
        11, "#ff8f23",
        16, "#f54537",
      ],
      "circle-opacity": 0.78,
      "circle-stroke-width": 0.6,
      "circle-stroke-color": "rgba(255,255,255,0.42)",
    },
  }, beforeId);
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

function addHeatmapLayers(
  map: maplibregl.Map,
  generalHeatmap: HeatmapPoint[],
  campaignHeatmap: HeatmapPoint[],
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
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.30, 5, 0.42, 6, 0.52, 8, 0.78, 11, 1.10, 14, 1.45, 18, 1.80],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 14, 5, 24, 6, 32, 8, 48, 11, 66, 14, 88, 18, 108],
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
            "case",
            ["<", ["zoom"], 6],
            ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(45,125,255,0)", 0.40, "rgba(45,125,255,0.30)", 0.50, "rgba(0,190,255,0.48)", 0.70, "rgba(0,215,135,0.62)", 0.80, "rgba(255,224,55,0.72)", 0.97, "rgba(255,143,35,0.82)", 1, "rgba(245,65,55,0.92)"],
            ["<", ["zoom"], 10],
            ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(45,125,255,0)", 0.30, "rgba(45,125,255,0.24)", 0.40, "rgba(0,190,255,0.45)", 0.60, "rgba(0,215,135,0.60)", 0.75, "rgba(255,224,55,0.70)", 0.88, "rgba(255,143,35,0.80)", 1, "rgba(245,65,55,0.92)"],
            ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(45,125,255,0)", 0.20, "rgba(45,125,255,0.20)", 0.30, "rgba(0,190,255,0.42)", 0.50, "rgba(0,215,135,0.58)", 0.70, "rgba(255,224,55,0.70)", 0.80, "rgba(255,143,35,0.80)", 1, "rgba(245,65,55,0.92)"]
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
        minzoom: GRID_MAX_ZOOM,
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
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.24, 5, 0.34, 6, 0.42, 8, 0.62, 11, 0.90, 14, 1.16, 18, 1.42],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 5, 20, 6, 28, 8, 40, 11, 54, 14, 70, 18, 86],
          "heatmap-opacity": [
            "interpolate", ["linear"], ["zoom"],
            5.5, 0.42,
            8, 0.50,
            12, 0.58,
            18, 0.64,
          ],
          "heatmap-color": [
            "case",
            ["<", ["zoom"], 6],
            ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(45,125,255,0)", 0.40, "rgba(35,125,255,0.34)", 0.50, "rgba(0,190,255,0.52)", 0.70, "rgba(0,215,135,0.68)", 0.80, "rgba(255,224,55,0.78)", 0.97, "rgba(255,143,35,0.86)", 1, "rgba(190,20,45,0.96)"],
            ["<", ["zoom"], 10],
            ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(45,125,255,0)", 0.30, "rgba(35,125,255,0.28)", 0.40, "rgba(0,190,255,0.50)", 0.60, "rgba(0,215,135,0.65)", 0.75, "rgba(255,224,55,0.76)", 0.88, "rgba(255,143,35,0.85)", 1, "rgba(190,20,45,0.96)"],
            ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(45,125,255,0)", 0.20, "rgba(35,125,255,0.24)", 0.30, "rgba(0,190,255,0.48)", 0.50, "rgba(0,215,135,0.64)", 0.70, "rgba(255,224,55,0.76)", 0.80, "rgba(255,143,35,0.86)", 1, "rgba(190,20,45,0.96)"]
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
      addHeatmapLayers(map, generalHeatmap, campaignHeatmap);
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
