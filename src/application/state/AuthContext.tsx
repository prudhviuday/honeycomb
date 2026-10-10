import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { getProfile } from '@/lib/api';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;

    // Subscribe before restoring the persisted session. This prevents a slower
    // getSession() response from overwriting a newer sign-in/sign-out event.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      authEventReceived = true;
      if (!mounted) return;
      setSession(newSession);

      const nextUser = newSession?.user ?? null;
      setUser((currentUser) => {
        // Supabase emits TOKEN_REFRESHED when a session's access token rotates.
        // The user identity has not changed in that case; retain the same object
        // so consumers don't refetch dashboards/profile data for a token-only update.
        if (
          event === 'TOKEN_REFRESHED' &&
          currentUser?.id &&
          currentUser.id === nextUser?.id
        ) {
          return currentUser;
        }
        return nextUser;
      });
      setLoading(false);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted || authEventReceived) return;
        if (error) {
          console.error('[Auth] Could not restore session:', error.message);
          setSession(null);
          setUser(null);
          return;
        }
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch((error: unknown) => {
        if (!mounted || authEventReceived) return;
        console.error('[Auth] Session restore failed:', error);
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      (async () => {
        const p = await getProfile(user.id);
        setProfile(p);
      })();
    } else {
      setProfile(null);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
