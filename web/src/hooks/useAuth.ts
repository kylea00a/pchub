"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMe } from "@/lib/api";
import {
  clearSession,
  getToken,
  getUser,
  type SessionUser,
} from "@/lib/auth-session";
import type { RenterProfile } from "@/lib/api";

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<RenterProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchMe();
      setUser(me.user);
      setProfile(me.profile);
    } catch {
      clearSession();
      setUser(getUser());
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function logout() {
    clearSession();
    setUser(null);
    setProfile(null);
  }

  return { user, profile, loading, reload: load, logout, isLoggedIn: Boolean(user) };
}
