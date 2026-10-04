import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { honeybadgerMapStyle } from '@/lib/mapStyle';
import type { MapFeature } from '@/lib/mapData';
import { createCampaignMarker, createUserMarker } from '@/lib/mapMarkers';

interface Props {
  features: MapFeature[];
  userLocation: { lng: number; lat: number } | null;
  onMarkerClick: (feature: MapFeature) => void;
  onMapClick: () => void;
}

const CHENNAI: [number, number] = [80.2707, 13.0827];

export function MapLibreMap({ features, userLocation, onMarkerClick, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hasFitRef = useRef(false);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMapClickRef = useRef(onMapClick);
  const featuresRef = useRef(features);

  featuresRef.current = features;
  onMarkerClickRef.current = onMarkerClick;
  onMapClickRef.current = onMapClick;

  // Initialize map once
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
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    // Pinch-zoom on touch devices without rotation
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('click', () => onMapClickRef.current());

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
  }, []);

  // Campaign/location markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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
            duration: 600,
          });
        },
      ),
    );

    return () => markers.forEach((m) => m.remove());
  }, [features]);

  // User marker; fit to markers on first location, recenter on later updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    userMarkerRef.current?.remove();
    userMarkerRef.current = createUserMarker(map, userLocation.lng, userLocation.lat).marker;

    if (!hasFitRef.current) {
      hasFitRef.current = true;
      const points: [number, number][] = featuresRef.current.map((f) => [f.location.longitude, f.location.latitude]);
      points.push([userLocation.lng, userLocation.lat]);
      const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    } else {
      map.easeTo({ center: [userLocation.lng, userLocation.lat], duration: 600 });
    }
  }, [userLocation]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
