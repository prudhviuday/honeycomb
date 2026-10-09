import { useEffect, useRef } from 'react';
import { useAuth } from '@/application/state/AuthContext';
import { recordUserLocation } from '@/modules/maps/api/locationApi';

const MIN_UPDATE_DISTANCE_METERS = 100;
const MIN_UPDATE_INTERVAL_MS = 2 * 60 * 1000;

function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function locationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied.';
    case error.POSITION_UNAVAILABLE:
      return 'The browser could not determine your location.';
    case error.TIMEOUT:
      return 'The browser took too long to determine your location.';
    default:
      return error.message || 'Unknown location error.';
  }
}

export function LocationTracker() {
  const { user } = useAuth();

  const lastSentRef = useRef<{
    latitude: number;
    longitude: number;
    sentAt: number;
  } | null>(null);

  useEffect(() => {
    lastSentRef.current = null;

    if (!user) return;

    if (!navigator.geolocation) {
      console.warn('[Location] Browser geolocation is not supported.');
      return;
    }

    let disposed = false;

    const save = async (position: GeolocationPosition) => {
      if (disposed) return;

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      console.info('[Location] Browser returned:', {
        latitude,
        longitude,
        accuracy,
        timestamp: new Date(position.timestamp).toISOString(),
      });

      const next = { latitude, longitude };
      const previous = lastSentRef.current;
      const elapsed = previous ? Date.now() - previous.sentAt : Infinity;
      const moved = previous ? distanceMeters(previous, next) : Infinity;

      if (
        previous &&
        moved < MIN_UPDATE_DISTANCE_METERS &&
        elapsed < MIN_UPDATE_INTERVAL_MS
      ) {
        return;
      }

      try {
        await recordUserLocation(
          latitude,
          longitude,
          Number.isFinite(accuracy) ? accuracy : undefined,
        );

        if (!disposed) {
          lastSentRef.current = {
            ...next,
            sentAt: Date.now(),
          };

          console.info('[Location] Successfully persisted:', next);
          window.dispatchEvent(new CustomEvent('honeycomb:location-updated', { detail: next }));
        }
      } catch (error) {
        console.error('[Location] Failed to persist location:', error);
      }
    };

    /*
     * Always request a fresh browser position when the authenticated
     * user first enters the app. This prevents an old cached position
     * from a previous session/location being saved as the new location.
     */
    const requestFreshPosition = () => {
      navigator.geolocation.getCurrentPosition(
        save,
        (error) => {
          console.warn(
            '[Location] Could not read location:',
            locationErrorMessage(error),
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        },
      );
    };

    requestFreshPosition();

    const watchId = navigator.geolocation.watchPosition(
      save,
      (error) => {
        console.warn(
          '[Location] Watch failed:',
          locationErrorMessage(error),
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestFreshPosition();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', requestFreshPosition);

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', requestFreshPosition);
    };
  }, [user?.id]);

  return null;
}
