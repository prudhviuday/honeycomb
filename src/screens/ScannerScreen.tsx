import { useState } from 'react';
import { ScanLine, Keyboard, X, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampaign } from '@/context/CampaignContext';
import { processScan, type ScanResult } from '@/lib/api';

interface Props {
  onScanComplete: () => void;
}

export function ScannerScreen({ onScanComplete }: Props) {
  const { user } = useAuth();
  const { activeCampaign, refreshCampaignUser } = useCampaign();
  const [showManual, setShowManual] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  const handleScan = async (scanCode: string) => {
    if (!activeCampaign || !user) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await processScan(activeCampaign.id, user.id, scanCode);
      setResult(res);
      if (res.success) await refreshCampaignUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      handleScan(code);
      setCode('');
      setShowManual(false);
    }
  };

  const handleCloseResult = () => {
    setResult(null);
    if (result?.success) onScanComplete();
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Scanner viewport — full bleed cinematic */}
      <div className="relative flex-1 overflow-hidden bg-bg-primary min-h-[60vh]">
        {/* Dark viewfinder background */}
        <div className="absolute inset-0 bg-black" />

        {/* Subtle grain */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }} />

        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
        }} />

        {/* Scanner frame */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-60 h-60">
            {/* Corner brackets — gold */}
            <div className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-gold rounded-tl-[4px]" />
            <div className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-gold rounded-tr-[4px]" />
            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-gold rounded-bl-[4px]" />
            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-gold rounded-br-[4px]" />
            {/* Scan line */}
            <div className="absolute left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent animate-scan-line shadow-[0_0_8px_rgba(212,175,55,0.6)]" />
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <ScanLine className="w-12 h-12 text-gold/15" />
            </div>
          </div>
        </div>

        {/* Top label */}
        <div className="absolute top-14 left-0 right-0 text-center px-8">
          <p className="text-[10px] text-text-subtle uppercase tracking-[0.3em] mb-1">Scanner</p>
          <p className="text-sm text-text-muted">Point at a QR code</p>
        </div>

        {/* Bottom actions overlay */}
        <div className="absolute bottom-6 left-0 right-0 px-5">
          <button
            onClick={() => setShowManual(true)}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 glass-strong hairline text-text-primary font-medium text-sm rounded-[10px] active:scale-[0.98] transition-transform"
          >
            <Keyboard className="w-[18px] h-[18px] text-gold" />
            Enter Code Manually
          </button>
        </div>
      </div>

      {/* Demo codes section */}
      <div className="px-5 py-6 bg-bg-secondary">
        <p className="text-[10px] text-text-subtle uppercase tracking-[0.2em] mb-3">Demo Codes</p>
        <div className="flex flex-wrap gap-2">
          {['CHN-PHX-001', 'CHN-MAR-003', 'CHN-TEA-009', 'CHN-AUT-010'].map((c) => (
            <button
              key={c}
              onClick={() => handleScan(c)}
              disabled={loading}
              className="px-3 py-2 bg-bg-surface hairline rounded-[8px] text-xs font-mono text-gold transition-colors hover:bg-bg-elevated disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center max-w-md mx-auto">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-xs text-text-muted tracking-wide uppercase">Processing</p>
          </div>
        </div>
      )}

      {/* Manual entry sheet */}
      {showManual && (
        <div className="fixed inset-0 z-50 max-w-md mx-auto" onClick={() => setShowManual(false)}>
          <div className="absolute inset-0 bg-black/50 animate-fade-in" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-[16px] hairline-t animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="font-display text-lg text-text-primary">Enter Code</h3>
              <button onClick={() => setShowManual(false)} className="text-text-subtle">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pb-6">
              <form onSubmit={handleSubmit}>
                <input
                  type="text"
                  placeholder="CHN-PHX-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-4 bg-bg-surface hairline rounded-[10px] text-text-primary placeholder:text-text-subtle font-mono text-center text-lg focus:outline-none focus:border-gold transition-colors mb-3"
                />
                <button
                  type="submit"
                  disabled={!code.trim() || loading}
                  className="w-full py-3.5 bg-gold text-bg-primary font-semibold text-sm rounded-[10px] disabled:opacity-40 active:scale-[0.98] transition-transform"
                >
                  Submit
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Result overlay */}
      {result && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center max-w-md mx-auto px-5" onClick={handleCloseResult}>
          <div className="w-full bg-bg-secondary hairline rounded-[12px] p-8 animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
            {result.success ? (
              <>
                <div className="w-16 h-16 rounded-full bg-gold/10 hairline flex items-center justify-center mx-auto mb-6">
                  <Zap className="w-7 h-7 text-gold" fill="currentColor" />
                </div>
                <p className="text-[10px] text-text-subtle uppercase tracking-[0.25em] mb-2">Points Earned</p>
                <p className="font-display text-5xl text-gold mb-3">+{result.pointsAwarded}</p>
                <p className="text-sm text-text-primary mb-1">{result.message}</p>
                <p className="text-xs text-text-muted mb-8">{result.sourceName}</p>
                <button
                  onClick={handleCloseResult}
                  className="w-full py-3.5 bg-gold text-bg-primary font-semibold text-sm rounded-[10px] active:scale-[0.98] transition-transform"
                >
                  Continue
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-7 h-7 text-red-400/80" />
                </div>
                <p className="text-[10px] text-text-subtle uppercase tracking-[0.25em] mb-2">Cannot Scan</p>
                <p className="text-sm text-text-primary mb-8">{result.message}</p>
                <button
                  onClick={handleCloseResult}
                  className="w-full py-3.5 bg-bg-surface hairline text-text-primary font-medium text-sm rounded-[10px] active:scale-[0.98] transition-transform"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && !result && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 max-w-md w-[90%] z-50">
          <div className="glass-strong hairline rounded-[10px] px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400/80 flex-shrink-0" />
            <p className="text-xs text-red-300/90">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
