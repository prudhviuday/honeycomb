import { useState } from 'react';
import { Mail, Lock, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { signIn, signUp } from '@/lib/api';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        // Development-friendly: the name is optional. If omitted, Supabase
        // receives a harmless default and the user can edit it later.
        const name = displayName.trim() || 'Honeycomb User';
        await signUp(email.trim(), password, name);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';

      if (msg.toLowerCase().includes('already registered')) {
        setError('This email is already registered. Try logging in.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Email confirmation is enabled in Supabase. Disable it for development so signup can enter the app immediately.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-6 py-8">
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center mb-12">
          <div className="flex items-baseline gap-1 mb-2">
            <span className="font-display text-3xl text-text-primary tracking-wide">HONEY</span>
            <span className="font-display text-3xl gold-text tracking-wide">BADGER</span>
          </div>
          <div className="h-px w-12 bg-gold/40" />
          <p className="text-[11px] text-text-muted mt-3 tracking-[0.3em] uppercase">Media</p>
        </div>

        <div className="flex mb-8 hairline-b">
          {(['signup', 'login'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={`flex-1 py-3 text-sm font-medium tracking-wide transition-all relative ${
                mode === m ? 'text-text-primary' : 'text-text-subtle'
              }`}
            >
              {m === 'signup' ? 'Create Account' : 'Log In'}
              {mode === m && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold" />}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <Field label="Display Name (optional)" icon={UserIcon}>
              <input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                className="w-full bg-transparent text-text-primary placeholder:text-text-subtle focus:outline-none text-sm py-3"
              />
            </Field>
          )}

          <Field label="Email" icon={Mail}>
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full bg-transparent text-text-primary placeholder:text-text-subtle focus:outline-none text-sm py-3"
            />
          </Field>

          <Field label="Password" icon={Lock}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              className="w-full bg-transparent text-text-primary placeholder:text-text-subtle focus:outline-none text-sm py-3 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-muted"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
          </Field>

          {error && <p className="text-xs text-red-400/90 px-1">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-accent text-white font-semibold text-sm tracking-wide rounded-[10px] hover:bg-accent-bright transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] mt-6"
          >
            {loading ? 'Creating...' : mode === 'signup' ? 'Create Account' : 'Log In'}
          </button>
        </form>

        <p className="text-center text-[11px] text-text-subtle mt-8 leading-relaxed">
          Join movie campaigns. Scan QR codes at real locations.<br />Earn points. Win rewards.
        </p>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="hairline-b">
      <label className="text-[10px] text-text-subtle uppercase tracking-[0.2em] font-medium block mt-1">{label}</label>
      <div className="relative flex items-center">
        <Icon className="w-[18px] h-[18px] text-text-subtle mr-3 flex-shrink-0" />
        {children}
      </div>
    </div>
  );
}
