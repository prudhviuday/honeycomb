import { useState } from 'react';
import { X, User as UserIcon, MapPin, Check } from 'lucide-react';
import type { Profile } from '@/types';

interface Props {
  profile: Profile | null;
  onSave: (data: { display_name: string; city: string }) => Promise<void>;
  onClose: () => void;
}

export function ProfileEditModal({ profile, onSave, onClose }: Props) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ display_name: displayName, city });
      setSaved(true);
      setTimeout(() => onClose(), 700);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 max-w-lg mx-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 animate-fade-in" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-[16px] hairline-t animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="font-display text-lg text-text-primary">Edit Profile</h3>
          <button onClick={onClose} className="text-text-subtle hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-5">
          <div className="hairline-b">
            <label className="text-[10px] text-text-subtle uppercase tracking-[0.2em] font-medium block mt-2">Display Name</label>
            <div className="flex items-center">
              <UserIcon className="w-[18px] h-[18px] text-text-subtle mr-3 flex-shrink-0" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-transparent text-text-primary placeholder:text-text-subtle focus:outline-none text-sm py-3"
              />
            </div>
          </div>
          <div className="hairline-b">
            <label className="text-[10px] text-text-subtle uppercase tracking-[0.2em] font-medium block">City</label>
            <div className="flex items-center">
              <MapPin className="w-[18px] h-[18px] text-text-subtle mr-3 flex-shrink-0" />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Chennai"
                className="w-full bg-transparent text-text-primary placeholder:text-text-subtle focus:outline-none text-sm py-3"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="w-full py-3.5 bg-accent text-white font-semibold text-sm rounded-[10px] flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
