import { useEffect, useState } from "react";
import { recordUserLocation } from "@/modules/maps/api/locationApi";

interface Props {
  onLocation: (location: { lat: number; lng: number } | null) => void;
}
export function LocationTracker({ onLocation }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setMessage("Location is not supported by this browser.");
      setEnabled(false);
      return;
    }
    let disposed = false;
    let pending = false;
    let lastSaved = 0;
    const watch = navigator.geolocation.watchPosition(
      async (position) => {
        if (disposed) return;
        const { latitude, longitude, accuracy } = position.coords;
        onLocation({ lat: latitude, lng: longitude });
        if (pending || Date.now() - lastSaved < 120000) return;
        pending = true;
        lastSaved = Date.now();
        try {
          await recordUserLocation(latitude, longitude, accuracy);
          if (!disposed) {
            lastSaved = Date.now();
            setMessage("Location sharing is on while this map is open.");
          }
        } catch {
          if (!disposed)
            setMessage("Location found, but it could not be saved.");
        } finally {
          pending = false;
        }
      },
      (error) => {
        if (disposed) return;
        setMessage(
          error.code === 1
            ? "Location permission was denied. You can still browse venues."
            : "Location is unavailable. You can still browse venues.",
        );
        if (error.code === 1) setEnabled(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watch);
    };
  }, [enabled, onLocation]);
  return (
    <div className="glass-strong rounded-xl p-3 text-xs pointer-events-auto">
      <button
        className="text-gold font-semibold"
        onClick={() => {
          if (enabled) {
            setEnabled(false);
            onLocation(null);
            setMessage("Location sharing stopped.");
          } else {
            setEnabled(true);
            setMessage("Waiting for location permission…");
          }
        }}
      >
        {enabled ? "Stop sharing location" : "Use my location"}
      </button>
      <p className="text-text-muted mt-1">
        {message ||
          "Optional: show nearby venues and save your latest location to your account. It is not shown to other users."}
      </p>
    </div>
  );
}
