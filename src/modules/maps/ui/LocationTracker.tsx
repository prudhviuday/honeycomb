import { useEffect, useRef } from 'react';
import { useAuth } from '@/application/state/AuthContext';
import { recordUserLocation } from '@/modules/maps/api/locationApi';

const MIN_UPDATE_DISTANCE_METERS = 100;
const MIN_UPDATE_INTERVAL_MS = 2 * 60 * 1000;

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function LocationTracker() {
  const { user } = useAuth();
  const lastSentRef = useRef<{ latitude: number; longitude: number; sentAt: number } | null>(null);

  useEffect(() => {
    lastSentRef.current = null;
    if (!user || !navigator.geolocation) return;
    let disposed = false;

    const save = (position: GeolocationPosition) => {
      if (disposed) return;
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const previous = lastSentRef.current;
      const elapsed = previous ? Date.now() - previous.sentAt : Infinity;
      const moved = previous ? distanceMeters(previous, next) : Infinity;
      if (previous && moved < MIN_UPDATE_DISTANCE_METERS && elapsed < MIN_UPDATE_INTERVAL_MS) return;
      lastSentRef.current = { ...next, sentAt: Date.now() };
      recordUserLocation(next.latitude, next.longitude, Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined)
        .catch((error) => console.warn('[Location] Could not persist location:', error));
    };

    const requestCurrentPosition = () => {
      navigator.geolocation.getCurrentPosition(
        save,
        (error) => { if (error.code !== error.PERMISSION_DENIED) console.warn('[Location] Could not read location:', error.message); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
      );
    };

    requestCurrentPosition();
    const watchId = navigator.geolocation.watchPosition(
      save,
      (error) => { if (error.code !== error.PERMISSION_DENIED) console.warn('[Location] Watch failed:', error.message); },
      { enableHighAccuracy: true, maximumAge: 120000, timeout: 15000 },
    );

    const handleVisibility = () => { if (document.visibilityState === 'visible') requestCurrentPosition(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', requestCurrentPosition);

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', requestCurrentPosition);
    };
  }, [user?.id]);

  return null;
}
