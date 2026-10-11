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
import type { HeatmapPoint, Scan } from "@/modules/maps/types";
import { createCampaignMarker, createUserMarker } from "@/lib/mapMarkers";
import { supabase } from "@/infrastructure/supabase/client";

interface Props {
  features: MapFeature[];
  activityScans?: Scan[];
  generalHeatmap?: HeatmapPoint[];
  campaignHeatmap?: HeatmapPoint[];
  campaignId?: string | null;
  heatmapRefreshVersion?: number;
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
  heatZoomRadiusGrowth?: number;
}

const CHENNAI: [number, number] = [80.2707, 13.0827];
const DETAILED_MAX_ZOOM = 18;
const GENERAL_HEAT_SOURCE = "honeycomb-general-location-heat";
const CAMPAIGN_HEAT_SOURCE = "honeycomb-campaign-location-heat";
const GENERAL_HEAT_LAYER = "honeycomb-general-location-heat-layer";
const CAMPAIGN_HEAT_LAYER = "honeycomb-campaign-location-heat-layer";
const EMPTY_HEATMAP_POINTS: HeatmapPoint[] = [];
const HEATMAP_TILE_CACHE_TTL_MS = 60_000;
const MAX_CACHED_HEATMAP_TILES = 256;
const heatmapTileCache = new Map<string, { data: ArrayBuffer; expiresAt: number }>();
const heatmapTileRequests = new Map<string, Promise<ArrayBuffer>>();

function heatmapTileUrl(scope: "general" | "campaign", campaignId?: string | null) {
  return `honeycomb://heatmap/${scope}/${scope === "general" ? "all" : campaignId ?? "none"}/{z}/{x}/{y}.mvt`;
}

function buildHeatmapGeoJSON(points: HeatmapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points
      .filter((point) =>
        Number.isFinite(Number(point.latitude)) &&
        Number.isFinite(Number(point.longitude)) &&
        Number.isFinite(Number(point.weight)),
      )
      .map((point, index) => ({
        type: "Feature" as const,
        id: `heat-${index}-${point.latitude}-${point.longitude}`,
        geometry: { type: "Point" as const, coordinates: [Number(point.longitude), Number(point.latitude)] },
        properties: { weight: Number(point.weight) },
      })),
  };
}

function refreshHeatmapSources(map: maplibregl.Map, generalHeatmap: HeatmapPoint[], campaignHeatmap: HeatmapPoint[]) {
  (map.getSource(GENERAL_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(generalHeatmap));
  (map.getSource(CAMPAIGN_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildHeatmapGeoJSON(campaignHeatmap));
}

function decodeBase64Tile(value: string): ArrayBuffer {
  if (!value) return new ArrayBuffer(0);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function requestHeatmapTile(url: string): Promise<ArrayBuffer> {
  const now = Date.now();
  const cached = heatmapTileCache.get(url);
  if (cached && cached.expiresAt > now) {
    heatmapTileCache.delete(url);
    heatmapTileCache.set(url, cached);
    console.info("[MapPerf] heatmap-tile", url, "cache=hit", "bytes=", cached.data.byteLength);
    return cached.data.slice(0);
  }
  if (cached) heatmapTileCache.delete(url);
  const inFlight = heatmapTileRequests.get(url);
  if (inFlight) return inFlight;

  const startedAt = performance.now();
  const request = (async () => {
    const parsed = new URL(url);
    const [scope, campaignToken, zValue, xValue, yFile] = parsed.pathname.split("/").filter(Boolean);
    const z = Number(zValue);
    const x = Number(xValue);
    const y = Number((yFile ?? "").replace(/\.mvt$/, ""));
    if ((scope !== "general" && scope !== "campaign") || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Invalid heatmap tile URL: ${url}`);
    }
    const campaignId = scope === "general" || campaignToken === "none" ? null : campaignToken;
    const { data, error } = await supabase.rpc("get_location_heatmap_tile", {
      p_z: z, p_x: x, p_y: y, p_campaign_id: campaignId,
    });
    if (error) throw error;
    const tile = decodeBase64Tile(typeof data === "string" ? data : "");
    // Keep a separate copy because MapLibre may transfer the returned buffer to a worker.
    heatmapTileCache.set(url, { data: tile.slice(0), expiresAt: Date.now() + HEATMAP_TILE_CACHE_TTL_MS });
    while (heatmapTileCache.size > MAX_CACHED_HEATMAP_TILES) {
      const oldest = heatmapTileCache.keys().next().value;
      if (!oldest) break;
      heatmapTileCache.delete(oldest);
    }
    console.info("[MapPerf] heatmap-tile", `z=${z}`, `x=${x}`, `y=${y}`, `scope=${scope}`, `ms=${(performance.now() - startedAt).toFixed(1)}`, `bytes=${tile.byteLength}`, "cache=miss");
    return tile;
  })();
  heatmapTileRequests.set(url, request);
  try { return (await request).slice(0); }
  finally { if (heatmapTileRequests.get(url) === request) heatmapTileRequests.delete(url); }
}

maplibregl.addProtocol("honeycomb", async (params, abortController) => {
  const data = await requestHeatmapTile(params.url);
  if (abortController.signal.aborted) throw new Error("Heatmap tile request aborted");
  return { data, cacheControl: "max-age=60" };
});

export function invalidateHeatmapTileCache(campaignId?: string | null) {
  const matchingPath = campaignId ? `/campaign/${campaignId}/` : null;
  for (const key of heatmapTileCache.keys()) {
    if (!matchingPath || key.includes(matchingPath)) heatmapTileCache.delete(key);
  }
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
    // Strongly attenuate low-zoom intensity so a few nearby points do not
    // saturate the entire city view into red. Full intensity returns gradually
    // as the user zooms into street-level detail.
    const lowZoomReduction = 0.78 * Math.pow(1 - zoomProgress, effectiveFalloffSpeed);
    adjustedStops.push(zoom, Number((baseIntensity * normalizedScale * (1 - lowZoomReduction)).toFixed(3)));
  }
  return ["interpolate", ["linear"], ["zoom"], ...adjustedStops] as maplibregl.ExpressionSpecification;
}

function buildRadiusExpression(
  radiusScale: number,
  zoomRadiusGrowth: number,
  baseRadius: number,
): maplibregl.ExpressionSpecification {
  const overallMultiplier = 0.2 + Math.max(0, Math.min(1, radiusScale)) * 2.8;
  const growth = Math.max(0, Math.min(1, zoomRadiusGrowth));
  // Keep individual points compact at street zoom; let them spread progressively
  // as the camera zooms out to city, state, and country views.
  const stops: Array<[number, number]> = [
    [2, baseRadius * (1 + growth * 4)],
    [5, baseRadius * (1 + growth * 3.2)],
    [8, baseRadius * (1 + growth * 2.2)],
    [11, baseRadius * (1 + growth * 1.2)],
    [14, baseRadius * (1 + growth * 0.4)],
    [18, baseRadius],
  ];
  const adjustedStops: (number | string)[] = [];
  for (const [zoom, radius] of stops) adjustedStops.push(zoom, Number((radius * overallMultiplier).toFixed(2)));
  return ["interpolate", ["linear"], ["zoom"], ...adjustedStops] as maplibregl.ExpressionSpecification;
}

function applyHeatmapControls(
  map: maplibregl.Map,
  scale: number,
  falloffSpeed: number,
  radiusScale: number,
  zoomRadiusGrowth: number,
) {
  if (map.getLayer(GENERAL_HEAT_LAYER)) {
    map.setPaintProperty(GENERAL_HEAT_LAYER, "heatmap-intensity", buildIntensityExpression(GENERAL_INTENSITY_STOPS, scale * 5, falloffSpeed));
    map.setPaintProperty(GENERAL_HEAT_LAYER, "heatmap-radius", buildRadiusExpression(radiusScale, zoomRadiusGrowth, 6));
  }
  if (map.getLayer(CAMPAIGN_HEAT_LAYER)) {
    map.setPaintProperty(CAMPAIGN_HEAT_LAYER, "heatmap-intensity", buildIntensityExpression(CAMPAIGN_INTENSITY_STOPS, scale * 5, falloffSpeed));
    map.setPaintProperty(CAMPAIGN_HEAT_LAYER, "heatmap-radius", buildRadiusExpression(radiusScale, zoomRadiusGrowth, 5));
  }
}

function addHeatmapLayers(
  map: maplibregl.Map,
  campaignId: string | null | undefined,
  heatIntensityScale: number,
  zoomFalloffSpeed: number,
  generalHeatmap: HeatmapPoint[] = [],
  campaignHeatmap: HeatmapPoint[] = [],
) {
  const tiled = campaignId !== undefined;
  if (!map.getSource(GENERAL_HEAT_SOURCE)) {
    if (tiled) {
      map.addSource(GENERAL_HEAT_SOURCE, {
        type: "vector",
        tiles: [heatmapTileUrl("general")],
        minzoom: 2,
        maxzoom: DETAILED_MAX_ZOOM,
      });
    } else {
      map.addSource(GENERAL_HEAT_SOURCE, { type: "geojson", data: buildHeatmapGeoJSON(generalHeatmap) });
    }
  }

  if (!map.getSource(CAMPAIGN_HEAT_SOURCE)) {
    if (tiled) {
      map.addSource(CAMPAIGN_HEAT_SOURCE, {
        type: "vector",
        tiles: [heatmapTileUrl("campaign", campaignId)],
        minzoom: 2,
        maxzoom: DETAILED_MAX_ZOOM,
      });
    } else {
      map.addSource(CAMPAIGN_HEAT_SOURCE, { type: "geojson", data: buildHeatmapGeoJSON(campaignHeatmap) });
    }
  }
  const firstSymbolLayer = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;

  if (!map.getLayer(GENERAL_HEAT_LAYER)) {
    map.addLayer(
      {
        id: GENERAL_HEAT_LAYER,
        type: "heatmap",
        source: GENERAL_HEAT_SOURCE,
        ...(tiled ? { "source-layer": "heatmap" } : {}),
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
            0.22, "rgba(45,125,255,0.14)",
            0.42, "rgba(0,190,255,0.30)",
            0.60, "rgba(0,215,135,0.44)",
            0.76, "rgba(255,224,55,0.56)",
            0.90, "rgba(255,143,35,0.68)",
            0.99, "rgba(245,65,55,0.80)",
            1, "rgba(245,65,55,0.88)"
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
        ...(tiled ? { "source-layer": "heatmap" } : {}),
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
            0.24, "rgba(35,125,255,0.16)",
            0.44, "rgba(0,190,255,0.34)",
            0.62, "rgba(0,215,135,0.48)",
            0.78, "rgba(255,224,55,0.60)",
            0.91, "rgba(255,143,35,0.74)",
            0.99, "rgba(190,20,45,0.86)",
            1, "rgba(190,20,45,0.94)"
          ],
        },
      },
      firstSymbolLayer,
    );
  }

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
    map.addLayer(honeycombBuildingLayer as unknown as maplibregl.FillExtrusionLayerSpecification, firstSymbolLayer);
  } catch {
    // 3D is an enhancement; never let it break the underlying map.
  }
}

export function MapLibreMap({
  features,
  generalHeatmap = EMPTY_HEATMAP_POINTS,
  campaignHeatmap = EMPTY_HEATMAP_POINTS,
  campaignId,
  heatmapRefreshVersion = 0,
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
  heatZoomRadiusGrowth = 0.5,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const campaignIdRef = useRef(campaignId);
  const lastCampaignIdRef = useRef(campaignId);
  const lastHeatmapRefreshVersionRef = useRef(heatmapRefreshVersion);
  const generalHeatmapRef = useRef(generalHeatmap);
  const campaignHeatmapRef = useRef(campaignHeatmap);
  const lastFitHeatmapVersionRef = useRef(0);
  const heatIntensityScaleRef = useRef(heatIntensityScale);
  const zoomFalloffSpeedRef = useRef(zoomFalloffSpeed);
  const heatRadiusScaleRef = useRef(heatRadiusScale);
  const heatZoomRadiusGrowthRef = useRef(heatZoomRadiusGrowth);
  const hasInitializedLocationRef = useRef(false);

  campaignIdRef.current = campaignId;
  generalHeatmapRef.current = generalHeatmap;
  campaignHeatmapRef.current = campaignHeatmap;
  heatIntensityScaleRef.current = heatIntensityScale;
  zoomFalloffSpeedRef.current = zoomFalloffSpeed;
  heatRadiusScaleRef.current = heatRadiusScale;
  heatZoomRadiusGrowthRef.current = heatZoomRadiusGrowth;
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return;

    const mapStartedAt = performance.now();
    let firstHeatmapSettled = false;
    let zoomStartedAt: number | null = null;
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
    map.on("zoomstart", () => { zoomStartedAt = performance.now(); });
    map.on("idle", () => {
      if (!firstHeatmapSettled && map.getSource(GENERAL_HEAT_SOURCE)) {
        firstHeatmapSettled = true;
        console.info("[MapPerf] initial-heatmap-render-ms=", (performance.now() - mapStartedAt).toFixed(1));
      }
      if (zoomStartedAt !== null) {
        console.info("[MapPerf] zoom-settled-ms=", (performance.now() - zoomStartedAt).toFixed(1));
        zoomStartedAt = null;
      }
    });
    map.on("load", () => {
      console.info("[MapPerf] map-style-ready-ms=", (performance.now() - mapStartedAt).toFixed(1));
    });
    map.on("zoomend", () => {
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
      addHeatmapLayers(map, campaignIdRef.current, heatIntensityScaleRef.current, zoomFalloffSpeedRef.current, generalHeatmapRef.current, campaignHeatmapRef.current);
      applyHeatmapControls(map, heatIntensityScale, zoomFalloffSpeed, heatRadiusScale, heatZoomRadiusGrowth);
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
    const applyWhenReady = () => applyHeatmapControls(map, heatIntensityScale, zoomFalloffSpeed, heatRadiusScale, heatZoomRadiusGrowth);
    if (map.isStyleLoaded()) applyWhenReady();
    else map.once("load", applyWhenReady);
    return () => {
      map.off("load", applyWhenReady);
    };
  }, [heatIntensityScale, zoomFalloffSpeed, heatRadiusScale, heatZoomRadiusGrowth]);

  useEffect(() => {
    const previousCampaignId = lastCampaignIdRef.current;
    const previousRefreshVersion = lastHeatmapRefreshVersionRef.current;
    lastCampaignIdRef.current = campaignId;
    lastHeatmapRefreshVersionRef.current = heatmapRefreshVersion;
    if (campaignId === undefined) return;
    if (previousCampaignId === campaignId && previousRefreshVersion === heatmapRefreshVersion) return;
    const map = mapRef.current;
    if (!map) return;
    const replaceCampaignSource = () => {
      invalidateHeatmapTileCache(campaignId);
      if (map.getLayer(CAMPAIGN_HEAT_LAYER)) map.removeLayer(CAMPAIGN_HEAT_LAYER);
      if (map.getSource(CAMPAIGN_HEAT_SOURCE)) map.removeSource(CAMPAIGN_HEAT_SOURCE);
      addHeatmapLayers(map, campaignIdRef.current, heatIntensityScaleRef.current, zoomFalloffSpeedRef.current, generalHeatmapRef.current, campaignHeatmapRef.current);
      applyHeatmapControls(map, heatIntensityScaleRef.current, zoomFalloffSpeedRef.current, heatRadiusScaleRef.current, heatZoomRadiusGrowthRef.current);
    };
    if (map.isStyleLoaded() && map.getSource(GENERAL_HEAT_SOURCE)) replaceCampaignSource();
    else map.once("load", replaceCampaignSource);
    return () => { map.off("load", replaceCampaignSource); };
  }, [campaignId, heatmapRefreshVersion]);

  useEffect(() => {
    if (campaignId !== undefined) return;
    const map = mapRef.current;
    if (!map) return;
    const update = () => refreshHeatmapSources(map, generalHeatmap, campaignHeatmap);
    if (map.getSource(GENERAL_HEAT_SOURCE)) update();
    else map.once("load", update);
    return () => { map.off("load", update); };
  }, [campaignId, generalHeatmap, campaignHeatmap]);

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
    if (!map || fitHeatmapVersion <= lastFitHeatmapVersionRef.current || !campaignHeatmap.length) return;
    lastFitHeatmapVersionRef.current = fitHeatmapVersion;
    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();
      campaignHeatmap.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 5.2, duration: 900 });
    };
    if (map.getSource(GENERAL_HEAT_SOURCE)) fit();
    else map.once("load", fit);
    return () => { map.off("load", fit); };
  }, [campaignHeatmap, fitHeatmapVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitActivity || !campaignHeatmap.length) return;
    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();
      campaignHeatmap.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 400 });
    };
    if (map.getSource(GENERAL_HEAT_SOURCE)) fit();
    else map.once("load", fit);
    return () => { map.off("load", fit); };
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
