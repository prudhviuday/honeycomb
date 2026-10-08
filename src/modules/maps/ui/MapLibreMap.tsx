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

function buildActivityGeoJSON(scans: Scan[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: scans
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

  const firstSymbolLayer = map
    .getStyle()
    .layers?.find((layer) => layer.type === "symbol")?.id;

  if (!map.getLayer(GENERAL_HEAT_LAYER)) {
    map.addLayer(
      {
        id: GENERAL_HEAT_LAYER,
        type: "heatmap",
        source: GENERAL_HEAT_SOURCE,
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
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.75,
            5,
            0.95,
            8,
            1.2,
            11,
            1.45,
            14,
            1.7,
            18,
            2.0,
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            28,
            5,
            50,
            8,
            72,
            11,
            88,
            14,
            104,
            18,
            120,
          ],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.55,
            6,
            0.62,
            10,
            0.68,
            14,
            0.72,
            18,
            0.76,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.10,
            "rgba(0,102,255,0.05)",
            0.22,
            "rgba(0,174,255,0.28)",
            0.38,
            "rgba(0,235,255,0.52)",
            0.55,
            "rgba(92,92,255,0.70)",
            0.72,
            "rgba(194,48,255,0.84)",
            0.88,
            "rgba(255,35,177,0.94)",
            1,
            "rgba(255,238,255,0.98)",
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
        minzoom: 7,
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
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            0.95,
            9,
            1.15,
            11,
            1.45,
            14,
            1.8,
            18,
            2.1,
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            38,
            9,
            50,
            11,
            62,
            14,
            80,
            18,
            98,
          ],
          "heatmap-opacity": 0.78,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,102,255,0)",
            0.12,
            "rgba(0,190,255,0.16)",
            0.28,
            "rgba(0,225,255,0.36)",
            0.45,
            "rgba(84,86,255,0.58)",
            0.62,
            "rgba(174,45,255,0.74)",
            0.80,
            "rgba(255,35,180,0.90)",
            0.92,
            "rgba(255,92,202,0.96)",
            1,
            "rgba(255,242,255,1)",
          ],
        },
      },
      firstSymbolLayer,
    );
  }

  (
    map.getSource(GENERAL_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined
  )?.setData(buildHeatmapGeoJSON(generalHeatmap));

  (
    map.getSource(CAMPAIGN_HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined
  )?.setData(buildHeatmapGeoJSON(campaignHeatmap));
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
    const update = () => {
      (
        map.getSource(GENERAL_HEAT_SOURCE) as
          maplibregl.GeoJSONSource | undefined
      )?.setData(buildHeatmapGeoJSON(generalHeatmap));

      (
        map.getSource(CAMPAIGN_HEAT_SOURCE) as
          maplibregl.GeoJSONSource | undefined
      )?.setData(buildHeatmapGeoJSON(campaignHeatmap));
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
