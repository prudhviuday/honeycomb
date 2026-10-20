import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles } from 'lucide-react';
import { FanTierBadge, getFanTier } from '@/components/badges/FanTierBadge';
import { FanJourneyPanel } from './FanJourneyPanel';

interface Props {
  points: number;
  onClose: () => void;
}

export function FanTierDetailsModal({ points, onClose }: Props) {
  const tier = getFanTier(points);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fan-tier-modal fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-5"
      style={{ position: 'fixed', inset: 0, zIndex: 9999, visibility: 'visible' }}
      onClick={onClose}
    >
      <button
        type="button"
        className="fan-tier-modal-backdrop absolute inset-0"
        aria-label="Close fan badge details"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fan-tier-modal-title"
        className="fan-tier-modal-sheet relative z-10 mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0B0B14] shadow-[0_-22px_80px_rgba(0,0,0,0.65)] animate-slide-up sm:rounded-[28px]" style={{ height: "min(70dvh, 760px)", minHeight: "min(60dvh, 460px)", visibility: "visible", opacity: 1 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fan-tier-modal-header relative shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-3">
          <span className="fan-tier-modal-orb fan-tier-modal-orb--gold" aria-hidden="true" />
          <span className="fan-tier-modal-orb fan-tier-modal-orb--violet" aria-hidden="true" />
          <div className="relative">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="fan-tier-modal-current-medal flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
                  <FanTierBadge points={points} size="md" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-amber-100/65">Honeycomb · Fan vault</p>
                  <h2 id="fan-tier-modal-title" className="mt-1 font-display text-[23px] leading-tight text-white">Your fan rank</h2>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">{tier.name} · {Math.max(0, Number(points) || 0).toLocaleString()} overall points</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close fan badge details"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/65 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-white/40">
              <Sparkles className="h-3.5 w-3.5 text-amber-200/70" />
              <span>Unlock rarer medals as your fan rank rises.</span>
            </div>
          </div>
        </div>
        <div className="fan-tier-modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),18px)] pt-2 sm:px-5">
          <FanJourneyPanel points={points} />
        </div>
      </section>
    </div>,
    document.body,
  );
}
