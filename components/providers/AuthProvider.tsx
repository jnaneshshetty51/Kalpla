"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { UserContextType, UserProfile } from "@/types/user";
import { signOut as signOutAuth } from "@/lib/supabase/auth";

const AuthContext = createContext<UserContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const supabase = createClient();

  const fetchProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      try {
        const { data, error: profileErr } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        if (profileErr) {
          console.error("Error fetching user profile:", profileErr);
          return null;
        }

        return data as UserProfile | null;
      } catch (err) {
        console.error("Unexpected error fetching user profile:", err);
        return null;
      }
    },
    [supabase],
  );

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user: currentUser },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) {
        setError(userErr);
        setUser(null);
        setProfile(null);
        return;
      }

      setUser(currentUser);

      if (currentUser) {
        const userProfile = await fetchProfile(currentUser.id);
        setProfile(userProfile);
      } else if (
        process.env.NODE_ENV !== "production" &&
        typeof document !== "undefined" &&
        document.cookie.includes("kalpla_showcase=true")
      ) {
        setUser({
          id: "showcase-user-id",
          email: "arjun.mehta@kalpla.io",
          app_metadata: {},
          user_metadata: { name: "Arjun Mehta" },
          aud: "authenticated",
          created_at: "2026-08-01T00:00:00Z",
        } as unknown as User);
        setProfile({
          id: "showcase-user-id",
          name: "Arjun Mehta",
          goal: "Staff GenAI & Agent Architect",
          experience_level: "advanced",
          time_budget_minutes_per_day: 60,
          timeline_days: 90,
          role: "admin",
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-10-11T00:00:00Z",
        });
      } else {
        setProfile(null);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
    } finally {
      setLoading(false);
    }
  }, [supabase, fetchProfile]);

  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      await signOutAuth();
      setUser(null);
      setProfile(null);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        setUser(currentUser);

        if (currentUser) {
          const userProfile = await fetchProfile(currentUser.id);
          if (isMounted) setProfile(userProfile);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      const authUser = session?.user ?? null;
      setUser(authUser);

      if (authUser) {
        const userProfile = await fetchProfile(authUser.id);
        if (isMounted) setProfile(userProfile);
      } else {
        if (isMounted) setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        signOut: handleSignOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useUser(): UserContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useUser must be used within an AuthProvider");
  }
  return context;
}
