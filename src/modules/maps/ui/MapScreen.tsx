import { useEffect, useMemo, useState } from 'react';
import { Search, X, MapPin, Check, Navigation, Zap, Film, ChevronDown } from 'lucide-react';
import { useAuth } from '@/application/state/AuthContext';
import { useCampaign } from '@/application/state/CampaignContext';
import { getLocations, getInteractionSources, getUserScans } from '@/modules/maps/api/mapsApi';
import { getLocationHeatmap } from '@/modules/maps/api/locationApi';
import { buildMapFeatures, calculateDistance, formatDistance, type MapFeature } from '@/modules/maps/logic/mapData';
import { MapLibreMap } from '@/modules/maps/ui/MapLibreMap';
import type { Campaign } from '@/modules/shared/types';
import type { Location, InteractionSource, Scan, HeatmapPoint } from '@/modules/maps/types';

interface Props {
  onNavigate?: (tab: 'scanner') => void;
}

export function MapScreen({ onNavigate }: Props) {
  const { user } = useAuth();
  const { campaigns, activeCampaign } = useCampaign();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(activeCampaign);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [activityScans, setActivityScans] = useState<Scan[]>([]);
  const [generalHeatmap, setGeneralHeatmap] = useState<HeatmapPoint[]>([]);
  const [campaignHeatmap, setCampaignHeatmap] = useState<HeatmapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MapFeature | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [moviePickerOpen, setMoviePickerOpen] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lng: number; lat: number } | null>(null);
  const [query, setQuery] = useState('');
  const [locationVersion, setLocationVersion] = useState(0);
  const [recenterVersion, setRecenterVersion] = useState(0);

  useEffect(() => {
    if (activeCampaign && !selectedCampaign) setSelectedCampaign(activeCampaign);
  }, [activeCampaign, selectedCampaign]);

  useEffect(() => {
    if (selectedCampaign && user) {
      (async () => {
        setLoading(true);
        setSelected(null);
        setPanelOpen(false);
        try {
          // Keep the map usable when one optional request (especially the
          // heatmap RPC) fails. A single rejected request must not erase all
          // venue markers and otherwise-successful map data.
          const [
            locationsResult,
            sourcesResult,
            scansResult,
            generalPointsResult,
            campaignPointsResult,
          ] = await Promise.allSettled([
            getLocations(selectedCampaign.id),
            getInteractionSources(selectedCampaign.id),
            getUserScans(selectedCampaign.id, user.id),
            getLocationHeatmap(null),
            getLocationHeatmap(selectedCampaign.id),
          ]);

          const locs = locationsResult.status === 'fulfilled' ? locationsResult.value : [];
          const srcs = sourcesResult.status === 'fulfilled' ? sourcesResult.value : [];
          const userScans = scansResult.status === 'fulfilled' ? scansResult.value : [];
          const generalPoints = generalPointsResult.status === 'fulfilled' ? generalPointsResult.value : [];
          const campaignPoints = campaignPointsResult.status === 'fulfilled' ? campaignPointsResult.value : [];

          if (locationsResult.status === 'rejected') console.warn('[Map] Locations failed to load:', locationsResult.reason);
          if (sourcesResult.status === 'rejected') console.warn('[Map] Interaction sources failed to load:', sourcesResult.reason);
          if (scansResult.status === 'rejected') console.warn('[Map] User scans failed to load:', scansResult.reason);
          if (generalPointsResult.status === 'rejected') console.warn('[Map] General heatmap failed to load:', generalPointsResult.reason);
          if (campaignPointsResult.status === 'rejected') console.warn('[Map] Campaign heatmap failed to load:', campaignPointsResult.reason);

          setActivityScans(userScans);
          setGeneralHeatmap(generalPoints);
          setCampaignHeatmap(campaignPoints);
          setFeatures(buildMapFeatures(locs, srcs, userScans));
        } catch (error) {
          console.error('[Map] Failed to prepare map data:', error);
          setFeatures([]);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [selectedCampaign, user, locationVersion]);

  useEffect(() => {
    const handleLocationUpdated = () => setLocationVersion((value) => value + 1);
    window.addEventListener('honeycomb:location-updated', handleLocationUpdated);
    return () => window.removeEventListener('honeycomb:location-updated', handleLocationUpdated);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
        () => setUserLoc(null),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    } else {
      setUserLoc(null);
    }
  }, []);

  const scannedCount = features.filter((f) => f.isScanned).length;
  const nearbyCount = userLoc
    ? features.filter((f) => calculateDistance(userLoc.lat, userLoc.lng, f.location.latitude, f.location.longitude) < 5 && !f.isScanned).length
    : 0;
  const q = query.trim().toLowerCase();
  const visibleFeatures = q
    ? features.filter((f) => `${f.location?.name ?? ''} ${f.location?.address ?? ''}`.toLowerCase().includes(q))
    : features;

  const movieOptions = useMemo(() => {
    const seen = new Set<string>();
    return campaigns.filter((campaign) => {
      if (seen.has(campaign.id)) return false;
      seen.add(campaign.id);
      return true;
    });
  }, [campaigns]);

  const handleMarkerClick = (feature: MapFeature) => {
    setSelected(feature);
    setPanelOpen(true);
  };
  const handleMapClick = () => setPanelOpen(false);
  const recenter = () => {
    if (userLoc) setRecenterVersion((value) => value + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedDist = selected && userLoc
    ? calculateDistance(userLoc.lat, userLoc.lng, selected.location.latitude, selected.location.longitude)
    : null;

  return (
    <div className="relative h-screen pb-20 overflow-hidden">
      <MapLibreMap
        features={visibleFeatures}
        activityScans={activityScans}
        generalHeatmap={generalHeatmap}
        campaignHeatmap={campaignHeatmap}
        userLocation={userLoc}
        recenterVersion={recenterVersion}
        onMarkerClick={handleMarkerClick}
        onMapClick={handleMapClick}
      />

      <div className="absolute top-0 left-0 right-0 p-4 z-10 pointer-events-none space-y-2">
        <div className="glass-strong hairline rounded-[14px] px-3 py-2 pointer-events-auto shadow-lg shadow-black/40">
          <button
            type="button"
            onClick={() => setMoviePickerOpen((open) => !open)}
            className="w-full flex items-center gap-3 text-left"
          >
            <div className="w-8 h-8 rounded-[9px] bg-accent/15 flex items-center justify-center flex-shrink-0">
              <Film className="w-4 h-4 text-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] text-text-muted uppercase tracking-[0.18em]">Map campaign</p>
              <p className="text-sm text-text-primary font-medium truncate">
                {selectedCampaign?.movie_title || selectedCampaign?.title || 'Select a movie'}
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${moviePickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {moviePickerOpen && (
            <div className="mt-2 pt-2 border-t border-white/10 max-h-56 overflow-y-auto no-scrollbar">
              {movieOptions.length === 0 ? (
                <p className="text-xs text-text-muted py-3 px-1">No active movie campaigns.</p>
              ) : movieOptions.map((campaign) => {
                const isSelected = campaign.id === selectedCampaign?.id;
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setMoviePickerOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left ${isSelected ? 'bg-gold/10' : 'hover:bg-white/5'}`}
                  >
                    <div className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ${isSelected ? 'ring-1 ring-gold/50' : ''}`}>
                      {campaign.hero_image_url ? (
                        <img src={campaign.hero_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/10 flex items-center justify-center"><Film className="w-3.5 h-3.5 text-text-muted" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-primary truncate">{campaign.movie_title || campaign.title}</p>
                      <p className="text-[10px] text-text-subtle truncate">{campaign.title}</p>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-gold flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-strong hairline rounded-full h-11 pl-4 pr-2 flex items-center gap-2.5 pointer-events-auto shadow-lg shadow-black/40">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations"
            className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-subtle outline-none"
          />
          {query ? (
            <button onClick={() => setQuery('')} className="w-7 h-7 rounded-full flex items-center justify-center text-text-muted">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-[10px] text-text-muted px-2 whitespace-nowrap">{scannedCount}/{features.length} explored</span>
          )}
        </div>
      </div>

      {!panelOpen && nearbyCount > 0 && (
        <div className="absolute top-28 left-4 right-4 z-10 pointer-events-none">
          <div className="glass rounded-[10px] px-3 py-2 flex items-center gap-2 animate-fade-in">
            <Zap className="w-3.5 h-3.5 text-gold flex-shrink-0" />
            <p className="text-[11px] text-text-primary"><span className="text-gold font-medium">{nearbyCount}</span> {nearbyCount === 1 ? 'mission' : 'missions'} nearby</p>
          </div>
        </div>
      )}

      <button onClick={recenter} className="absolute right-4 bottom-28 z-10 w-10 h-10 glass-strong hairline rounded-full flex items-center justify-center active:scale-90 transition-transform">
        <Navigation className="w-4 h-4 text-gold" />
      </button>

      {!panelOpen && (
        <div className="absolute bottom-24 left-4 right-4 z-10 pointer-events-none">
          <div className="glass-strong rounded-[12px] px-4 py-3 flex items-center justify-between pointer-events-auto">
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">{features.length} locations</p>
              <p className="text-sm text-text-primary font-medium">{scannedCount} explored</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gold" /><span className="text-[10px] text-text-muted">Available</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 ml-1.5" /><span className="text-[10px] text-text-muted">Done</span>
            </div>
          </div>
        </div>
      )}

      {panelOpen && selected && (
        <div className="fixed inset-0 z-50 max-w-lg mx-auto" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-black/40 animate-fade-in" />
          <div className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-[16px] hairline-t animate-slide-up max-h-[72%] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-bg-secondary pt-3 pb-2 z-10"><div className="w-10 h-1 bg-white/15 rounded-full mx-auto" /></div>
            <div className="px-5 pb-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-[10px] text-gold uppercase tracking-[0.2em] mb-1.5">{selected.category === 'activation' && 'Movie Campaign'}{selected.category === 'reward' && 'Reward Location'}{selected.category === 'mission' && 'Mission'}{selected.category === 'venue' && 'Venue'}</p>
                  <h3 className="font-display text-xl text-text-primary leading-tight">{selected.location.name}</h3>
                  <p className="text-xs text-text-muted mt-1">{selected.location.address}</p>
                </div>
                <button onClick={() => setPanelOpen(false)} className="text-text-subtle hover:text-text-primary mt-1"><X className="w-5 h-5" /></button>
              </div>
              {selectedDist !== null && <div className="flex items-center gap-2 mb-4 text-text-subtle"><Navigation className="w-3.5 h-3.5" /><span className="text-[11px]">{formatDistance(selectedDist)}</span></div>}
              <div className="mb-5">
                {selected.isScanned ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20"><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[11px] text-emerald-400 font-medium">Mission completed · +{selected.totalPoints} XP</span></div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20"><Zap className="w-3.5 h-3.5 text-gold" fill="currentColor" /><span className="text-[11px] text-gold font-medium">Mission available · +{selected.totalPoints} XP</span></div>
                )}
              </div>
              {selected.sources.length > 0 && (
                <div className="space-y-px mb-5">
                  <p className="text-[10px] text-text-subtle uppercase tracking-[0.2em] mb-3">Scan Points</p>
                  {selected.sources.map((src) => {
                    const isScanned = selected.isScanned && src.location_id === selected.location.id;
                    return <div key={src.id} className="flex items-center justify-between py-3 hairline-b last:border-b-0"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center ${isScanned ? 'bg-emerald-500/15' : 'bg-gold/10'}`}>{isScanned ? <Check className="w-4 h-4 text-emerald-400" /> : <MapPin className="w-4 h-4 text-gold" />}</div><div><p className="text-sm text-text-primary">{src.name}</p><p className="text-[11px] text-text-subtle capitalize">{src.source_type}</p></div></div><span className="font-display text-base text-gold">+{src.points}</span></div>;
                  })}
                </div>
              )}
              <button onClick={() => { setPanelOpen(false); onNavigate?.('scanner'); }} className="w-full py-3.5 bg-accent text-white font-semibold text-sm rounded-[10px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2">{selected.isScanned ? 'Already Scanned' : 'Scan Here'}{!selected.isScanned && <Zap className="w-4 h-4" fill="currentColor" />}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
