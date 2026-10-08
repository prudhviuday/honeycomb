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
}

const CHENNAI: [number, number] = [80.2707, 13.0827];
const DETAILED_MAX_ZOOM = 18;
const GENERAL_HEAT_SOURCE = "honeycomb-general-location-heat";
const GENERAL_HEAT_LAYER = "honeycomb-general-location-heat-layer";
const CAMPAIGN_HEAT_LAYER = "honeycomb-campaign-location-heat-layer";

function buildNeonPointsGeoJSON(
  general: HeatmapPoint[],
  campaign: HeatmapPoint[],
): GeoJSON.FeatureCollection {
  // The visual is intentionally point-based: a bright activity node with a
  // large soft halo. We keep the points separate from the heatmap renderer so
  // roads remain normal map roads and only nearby areas receive the glow.
  const points = [...general, ...campaign];
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
        id: `neon-${index}-${point.latitude}-${point.longitude}`,
        geometry: {
          type: "Point" as const,
          coordinates: [Number(point.longitude), Number(point.latitude)],
        },
        properties: { weight: Number(point.weight) },
      })),
  };
}

function addNeonGlowLayers(
  map: maplibregl.Map,
  generalHeatmap: HeatmapPoint[],
  campaignHeatmap: HeatmapPoint[],
) {
  if (!map.getSource(GENERAL_HEAT_SOURCE)) {
    map.addSource(GENERAL_HEAT_SOURCE, {
      type: "geojson",
      data: buildNeonPointsGeoJSON(generalHeatmap, campaignHeatmap),
    });
  }

  // The halo is deliberately rendered ABOVE the normal map/roads. That makes
  // the translucent blue/violet light wash over nearby roads, creating the
  // reflected-neon effect from the reference instead of recoloring every road.
  if (!map.getLayer(GENERAL_HEAT_LAYER)) {
    map.addLayer({
      id: GENERAL_HEAT_LAYER,
      type: "circle",
      source: GENERAL_HEAT_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            18,
            3,
            24,
            8,
            32,
            20,
            42,
          ],
          6,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            24,
            3,
            32,
            8,
            42,
            20,
            54,
          ],
          10,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            34,
            3,
            44,
            8,
            58,
            20,
            72,
          ],
          14,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            42,
            3,
            54,
            8,
            70,
            20,
            88,
          ],
          18,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            50,
            3,
            64,
            8,
            82,
            20,
            104,
          ],
        ],
        "circle-color": "#4d4dff",
        "circle-opacity": 0.16,
        "circle-blur": 1,
      },
    });
  }

  const neonCoreId = "honeycomb-neon-core";
  if (!map.getLayer(neonCoreId)) {
    map.addLayer({
      id: neonCoreId,
      type: "circle",
      source: GENERAL_HEAT_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          2.2,
          6,
          2.8,
          10,
          3.8,
          14,
          5,
          18,
          6.5,
        ],
        "circle-color": "#fff7ff",
        "circle-opacity": 0.98,
        "circle-blur": 0.05,
      },
    });
  }

  if (!map.getLayer(CAMPAIGN_HEAT_LAYER)) {
    map.addLayer({
      id: CAMPAIGN_HEAT_LAYER,
      type: "circle",
      source: GENERAL_HEAT_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            8,
            3,
            10,
            8,
            14,
            20,
            18,
          ],
          6,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            10,
            3,
            13,
            8,
            18,
            20,
            24,
          ],
          10,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            12,
            3,
            16,
            8,
            22,
            20,
            30,
          ],
          14,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            15,
            3,
            20,
            8,
            28,
            20,
            38,
          ],
          18,
          [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            1,
            18,
            3,
            24,
            8,
            34,
            20,
            46,
          ],
        ],
        "circle-color": "#ff2bd6",
        "circle-opacity": 0.42,
        "circle-blur": 0.78,
      },
    });
  }

  const source = map.getSource(GENERAL_HEAT_SOURCE) as
    maplibregl.GeoJSONSource | undefined;
  source?.setData(buildNeonPointsGeoJSON(generalHeatmap, campaignHeatmap));
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
      maxZoom: DETAILED_MAX_ZOOM,
      attributionControl: false,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    map.touchZoomRotate.disableRotation();
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
      addNeonGlowLayers(map, generalHeatmap, campaignHeatmap);

      (
        map.getSource(GENERAL_HEAT_SOURCE) as
          maplibregl.GeoJSONSource | undefined
      )?.setData(buildNeonPointsGeoJSON(generalHeatmap, campaignHeatmap));
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
    const update = () => {
      (
        map.getSource(GENERAL_HEAT_SOURCE) as
          maplibregl.GeoJSONSource | undefined
      )?.setData(buildNeonPointsGeoJSON(generalHeatmap, campaignHeatmap));
    };
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
