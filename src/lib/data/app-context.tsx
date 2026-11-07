"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { DEFAULT_TIMEZONE, periodOf, todayISO } from "../dates";
import { getSupabase } from "../supabase/client";
import { THEME_STORAGE_KEY } from "../theme-script";
import type { ThemePreference } from "../types";

interface SessionState {
  user: User | null;
  ready: boolean;
}
const SessionContext = createContext<SessionState>({ user: null, ready: false });

interface PeriodState {
  period: string;
  setPeriod: (p: string) => void;
}
const PeriodContext = createContext<PeriodState | null>(null);

const PERIOD_KEY = "myfin-period";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        dedupingInterval: 1500,
        errorRetryCount: 2,
        keepPreviousData: true,
      }}
    >
      <SessionProvider>
        <PeriodProvider>{children}</PeriodProvider>
      </SessionProvider>
    </SWRConfig>
  );
}

function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ user: null, ready: false });

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({ user: data.session?.user ?? null, ready: true });
      if (!data.session) router.replace("/login");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ user: session?.user ?? null, ready: true });
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(PERIOD_KEY);
        if (saved && /^\d{4}-\d{2}-01$/.test(saved)) return saved;
      } catch {
        /* storage unavailable */
      }
    }
    return periodOf(todayISO(DEFAULT_TIMEZONE));
  });
  const setPeriod = useCallback((p: string) => {
    setPeriodState(p);
    try {
      sessionStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const value = useMemo(() => ({ period, setPeriod }), [period, setPeriod]);
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used inside AppProviders");
  return ctx;
}

/** Applies a theme preference immediately and remembers it on this device. */
export function applyTheme(pref: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage unavailable */
  }
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#f2f2f7");
}
