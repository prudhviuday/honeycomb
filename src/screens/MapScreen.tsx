import { useEffect, useState, useRef } from 'react';
import { MapPin, Navigation, Crosshair, Store, Waves, TreePalm, Building2, Check, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { getLocations, getInteractionSources, getUserScans } from '@/lib/api';
import type { Location, InteractionSource, Scan } from '@/types';

const categoryIcons: Record<string, typeof MapPin> = {
  mall: Store, beach: Waves, park: TreePalm, market: Building2,
  transit: Navigation, neighborhood: MapPin, general: MapPin,
};

export function MapScreen() {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const [locations, setLocations] = useState<Location[]>([]);
  const [sources, setSources] = useState<InteractionSource[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Location | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const positionsRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    if (activeCampaign && user) {
      (async () => {
        setLoading(true);
        try {
          const [locs, srcs, userScans] = await Promise.all([
            getLocations(activeCampaign.id),
            getInteractionSources(activeCampaign.id),
            getUserScans(activeCampaign.id, user.id),
          ]);
          setLocations(locs);
          setSources(srcs);
          setScans(userScans);
          // Pre-compute marker positions deterministically
          positionsRef.current = locs.map((_, i) => ({
            x: 12 + (i % 3) * 30 + (i % 2) * 8,
            y: 18 + Math.floor(i / 3) * 28 + (i % 2) * 6,
          }));
        } catch {
          // ignore
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [activeCampaign, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const scannedSourceIds = new Set(scans.map(s => s.interaction_source_id));
  const scannedLocationIds = new Set(
    sources.filter(s => scannedSourceIds.has(s.id)).map(s => s.location_id)
  );

  const openLocation = (loc: Location) => {
    setSelected(loc);
    setPanelOpen(true);
  };

  return (
    <div className="flex flex-col h-screen pb-20">
      {/* Map — full bleed, Uber-style dark map */}
      <div className="relative flex-1 overflow-hidden bg-[#0d0d0d]">
        {/* Map background — dark streets style */}
        <div className="absolute inset-0">
          {/* Dark base */}
          <div className="absolute inset-0 bg-[#0d0d0d]" />
          {/* Street grid */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          {/* Major roads */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="none">
            <path d="M 0 180 Q 100 170 200 190 T 400 200" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <path d="M 0 350 Q 120 340 240 360 T 400 370" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <path d="M 150 0 Q 160 200 170 400 T 180 600" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <path d="M 280 0 Q 270 150 260 300 T 250 600" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <path d="M 0 80 Q 80 75 160 85 T 320 80" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
            <path d="M 0 480 Q 100 475 200 485 T 400 490" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
          </svg>
          {/* Coastline — Chennai Bay of Bengal */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="none">
            <path d="M 350 0 Q 330 100 340 250 Q 345 400 360 600" fill="none" stroke="rgba(56,132,191,0.08)" strokeWidth="40" />
            <path d="M 350 0 Q 330 100 340 250 Q 345 400 360 600" fill="none" stroke="rgba(56,132,191,0.04)" strokeWidth="70" />
          </svg>
          {/* Blocks / districts */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="none">
            <rect x="40" y="100" width="80" height="60" fill="rgba(255,255,255,0.012)" />
            <rect x="180" y="120" width="60" height="50" fill="rgba(255,255,255,0.012)" />
            <rect x="60" y="240" width="70" height="80" fill="rgba(255,255,255,0.012)" />
            <rect x="200" y="400" width="50" height="60" fill="rgba(255,255,255,0.012)" />
            <rect x="100" y="420" width="40" height="40" fill="rgba(255,255,255,0.012)" />
          </svg>
        </div>

        {/* Location markers — Snapchat/Uber style pins */}
        {locations.map((loc, i) => {
          const pos = positionsRef.current[i] ?? { x: 50, y: 50 };
          const isScanned = scannedLocationIds.has(loc.id);
          const Icon = categoryIcons[loc.category] ?? MapPin;
          return (
            <button
              key={loc.id}
              onClick={() => openLocation(loc)}
              className="absolute -translate-x-1/2 -translate-y-full transition-transform hover:scale-110 active:scale-95"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="relative animate-marker-drop" style={{ animationDelay: `${i * 60}ms` }}>
                {/* Pulse ring for unscanned */}
                {!isScanned && (
                  <div className="absolute inset-0 rounded-full bg-gold/20 pulse-ring" />
                )}
                {/* Pin */}
                <div className={`relative w-9 h-9 rounded-full flex items-center justify-center shadow-lg border-2 transition-all ${
                  isScanned
                    ? 'bg-bg-elevated border-white/20'
                    : 'bg-gold border-gold-bright shadow-gold/20'
                }`}>
                  <Icon className={`w-4 h-4 ${isScanned ? 'text-text-muted' : 'text-bg-primary'}`} />
                </div>
                {/* Pin tip */}
                <div className={`absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 ${
                  isScanned
                    ? 'border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-bg-elevated'
                    : 'border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-gold'
                }`} />
                {/* Scanned check */}
                {isScanned && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-bg-primary">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Current location indicator */}
        <div className="absolute left-[45%] top-[55%] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-0 rounded-full bg-blue-500/30 pulse-ring" />
          <div className="relative w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
        </div>

        {/* Top overlay — location label */}
        <div className="absolute top-0 left-0 right-0 p-5 z-10">
          <div className="glass rounded-[10px] px-4 py-2.5 inline-flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5 text-gold" />
            <span className="text-xs text-text-primary font-medium">Chennai</span>
            <span className="text-[10px] text-text-muted">· {scannedLocationIds.size}/{locations.length} explored</span>
          </div>
        </div>

        {/* Bottom overlay — location count */}
        {!panelOpen && (
          <div className="absolute bottom-5 left-5 right-5 z-10">
            <div className="glass-strong rounded-[12px] px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted">{locations.length} locations</p>
                <p className="text-sm text-text-primary font-medium">{scannedLocationIds.size} explored</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-[10px] text-text-muted">Available</span>
                <div className="w-2 h-2 rounded-full bg-emerald-500 ml-2" />
                <span className="text-[10px] text-text-muted">Done</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Location list — hidden when map is full-bleed, shown as bottom sheet */}
      {/* Bottom sheet — Uber-style slide-up panel */}
      {panelOpen && selected && (
        <div className="fixed inset-0 z-50 max-w-md mx-auto" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-black/40 animate-fade-in" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-[16px] hairline-t animate-slide-up max-h-[70%] overflow-y-auto no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="sticky top-0 bg-bg-secondary pt-3 pb-2 z-10">
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto" />
            </div>

            {/* Location header */}
            <div className="px-5 pb-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-display text-xl text-text-primary leading-tight">{selected.name}</h3>
                  <p className="text-xs text-text-muted mt-1">{selected.address}</p>
                </div>
                <button onClick={() => setPanelOpen(false)} className="text-text-subtle hover:text-text-primary mt-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Coords */}
              <div className="flex items-center gap-2 mb-5 text-text-subtle">
                <Navigation className="w-3.5 h-3.5" />
                <span className="text-[11px] font-mono">
                  {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                </span>
              </div>

              {/* Sources at this location */}
              {sources.filter(s => s.location_id === selected.id).length > 0 && (
                <div className="space-y-px">
                  <p className="text-[10px] text-text-subtle uppercase tracking-[0.2em] mb-3">QR Points</p>
                  {sources.filter(s => s.location_id === selected.id).map((src) => {
                    const isScanned = scannedSourceIds.has(src.id);
                    return (
                      <div key={src.id} className="flex items-center justify-between py-3 hairline-b last:border-b-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isScanned ? 'bg-emerald-500/15' : 'bg-gold/10'}`}>
                            {isScanned ? <Check className="w-4 h-4 text-emerald-400" /> : <MapPin className="w-4 h-4 text-gold" />}
                          </div>
                          <div>
                            <p className="text-sm text-text-primary">{src.name}</p>
                            <p className="text-[11px] text-text-subtle capitalize">{src.source_type}</p>
                          </div>
                        </div>
                        <span className="font-display text-base text-gold">+{src.points}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action */}
              <button
                onClick={() => setPanelOpen(false)}
                className="w-full mt-6 py-3.5 bg-gold text-bg-primary font-semibold text-sm rounded-[10px] active:scale-[0.98] transition-transform"
              >
                {scannedLocationIds.has(selected.id) ? 'Already Scanned' : 'Scan Here'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
