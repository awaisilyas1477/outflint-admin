import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import {
  fetchAdminForAuthUser,
  isActiveAdmin,
} from "@/lib/supabase/admins";

/**
 * GoTrue awaits the onAuthStateChange callback. Calling supabase.from() /
 * other client methods inside that await can deadlock with the auth lock.
 * Auth client docs: defer work with setTimeout(0) before touching the DB.
 * @see https://supabase.com/docs/reference/javascript/auth-onauthstatechange
 */
const BOOTSTRAP_FAILSAFE_MS = 12_000;

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveAuthorizedUser(
  session: Session | null,
): Promise<{ user: User | null; session: Session | null }> {
  if (!session?.user) {
    return { user: null, session: null };
  }

  if (!supabase) {
    return { user: null, session: null };
  }

  try {
    const admin = await fetchAdminForAuthUser(session.user.id);
    if (!isActiveAdmin(admin)) {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
      return { user: null, session: null };
    }

    return { user: session.user, session };
  } catch (e) {
    console.error("[auth] resolveAuthorizedUser:", e);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    return { user: null, session: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      queueMicrotask(() => setIsLoading(false));
      return;
    }

    const sb = client;

    let cancelled = false;

    const clearLoadingIfActive = () => {
      if (!cancelled) setIsLoading(false);
    };

    const failSafe = window.setTimeout(() => {
      if (!cancelled) {
        console.warn(
          "[auth] Session bootstrap exceeded timeout — clearing loading. Check network connectivity.",
        );
        setIsLoading(false);
      }
    }, BOOTSTRAP_FAILSAFE_MS);

    /**
     * Primary path: getSession() resolves reliably and does not depend on
     * onAuthStateChange(INITIAL_SESSION), which can be skipped if the listener
     * is torn down during React Strict Mode before the async emit runs.
     */
    async function bootstrap() {
      try {
        const {
          data: { session: initial },
        } = await sb.auth.getSession();
        if (cancelled) return;
        const resolved = await resolveAuthorizedUser(initial);
        if (cancelled) return;
        setSession(resolved.session);
        setUser(resolved.user);
      } catch (e) {
        console.error("[auth] bootstrap:", e);
        if (!cancelled) {
          setSession(null);
          setUser(null);
        }
      } finally {
        window.clearTimeout(failSafe);
        clearLoadingIfActive();
      }
    }

    void bootstrap();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      // First load is handled by bootstrap() + getSession(); avoid duplicate admin lookups.
      if (event === "INITIAL_SESSION") {
        return;
      }

      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (event === "TOKEN_REFRESHED" && nextSession?.user) {
        setSession(nextSession);
        setUser(nextSession.user);
        return;
      }

      if (event === "SIGNED_IN" && nextSession) {
        window.setTimeout(() => {
          void (async () => {
            try {
              const resolved = await resolveAuthorizedUser(nextSession);
              if (cancelled) return;
              setSession(resolved.session);
              setUser(resolved.user);
            } catch (e) {
              console.error("[auth] SIGNED_IN:", e);
              if (!cancelled) {
                setSession(null);
                setUser(null);
              }
            } finally {
              if (!cancelled) setIsLoading(false);
            }
          })();
        }, 0);
        return;
      }

      if (event === "USER_UPDATED" && nextSession?.user) {
        setSession(nextSession);
        setUser(nextSession.user);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error(ADMIN_MSG_CATALOG_UNAVAILABLE);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session?.user) {
      throw new Error("No session returned.");
    }

    const admin = await fetchAdminForAuthUser(data.session.user.id);
    if (!isActiveAdmin(admin)) {
      await supabase.auth.signOut();
      throw new Error(
        "Access denied. Your account is not an active admin in this project.",
      );
    }

    setSession(data.session);
    setUser(data.session.user);
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, session, isLoading, signIn, signOut }),
    [user, session, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
