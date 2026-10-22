"use client";

/**
 * One auth hook for the whole app, whichever mode we're in.
 *
 *   const { ready, authenticated, user, login, logout, authFetch } = useGuardianAuth();
 *
 * - tide mode: wraps `TideCloakProvider` (silent SSO via /silent-check-sso.html).
 * - dev mode:  one-click demo users, tokens minted by /api/dev/login.
 *
 * Use `authFetch(url, init, { fresh: true })` for votes and anything else that becomes
 * signed evidence: it refreshes the token first so each vote carries a new one.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TideCloakProvider, useTideCloak } from "@tidecloak/nextjs";
import type { Role } from "@/lib/contracts";
import { authMode, tideConfig, type AuthMode } from "./config";

export type GuardianUser = { id: string; username: string; displayName: string; roles: Role[] };

type FetchOpts = { fresh?: boolean };

export type GuardianAuth = {
  mode: AuthMode;
  ready: boolean;
  authenticated: boolean;
  user: GuardianUser | null;
  /** tide: redirects to TideCloak. dev: pass a demo username ("margaret", "sarah"...). */
  login: (devUsername?: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit, opts?: FetchOpts) => Promise<Response>;
};

const Ctx = createContext<GuardianAuth | null>(null);

export function useGuardianAuth(): GuardianAuth {
  const value = useContext(Ctx);
  if (!value) throw new Error("useGuardianAuth must be used inside <GuardianAuthProvider>");
  return value;
}

const ROLES: Role[] = ["principal", "circle_member", "requester"];

function withJson(init: RequestInit = {}, token?: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return { ...init, headers, credentials: "same-origin" };
}

// ---------------------------------------------------------------- tide mode

function TideBridge({ children }: { children: ReactNode }) {
  const tc = useTideCloak();
  const { authenticated, isInitializing, getValueFromToken, hasRealmRole, hasClientRole } = tc;

  const user = useMemo<GuardianUser | null>(() => {
    if (!authenticated) return null;
    const id = getValueFromToken("sub") as string;
    const username = (getValueFromToken("preferred_username") as string) ?? id;
    return {
      id,
      username,
      displayName: (getValueFromToken("name") as string) ?? (getValueFromToken("given_name") as string) ?? username,
      roles: ROLES.filter((r) => hasRealmRole(r) || hasClientRole(r)),
    };
  }, [authenticated, getValueFromToken, hasRealmRole, hasClientRole]);

  const authFetch = useCallback<GuardianAuth["authFetch"]>(
    async (input, init, opts) => {
      if (opts?.fresh) await tc.forceRefreshToken();
      const token = await tc.getToken();
      return fetch(input, withJson(init, token));
    },
    [tc],
  );

  const value: GuardianAuth = {
    mode: "tide",
    ready: !isInitializing,
    authenticated,
    user,
    login: () => tc.login(),
    logout: () => tc.logout(),
    authFetch,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------- dev mode

async function fetchDevMe(): Promise<GuardianUser | null> {
  const res = await fetch("/api/health-auth", { cache: "no-store" });
  const body = await res.json().catch(() => null);
  return body?.user ?? null;
}

function DevAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<GuardianUser | null>(null);

  const refreshMe = useCallback(async () => {
    const me = await fetchDevMe();
    setUser(me);
    setReady(true);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchDevMe().then((me) => {
      if (!alive) return;
      setUser(me);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(
    async (username?: string) => {
      if (!username) throw new Error("Pick a demo user (dev mode).");
      await fetch("/api/dev/login", withJson({ method: "POST", body: JSON.stringify({ username }) }));
      await refreshMe();
    },
    [refreshMe],
  );

  const logout = useCallback(async () => {
    await fetch("/api/dev/login", { method: "DELETE" });
    setUser(null);
  }, []);

  const authFetch = useCallback<GuardianAuth["authFetch"]>(
    async (input, init, opts) => {
      if (opts?.fresh && user) {
        // Re-mint so the vote carries a token issued after the request existed.
        await fetch("/api/dev/login", withJson({ method: "POST", body: JSON.stringify({ username: user.username }) }));
      }
      return fetch(input, withJson(init));
    },
    [user],
  );

  const value: GuardianAuth = { mode: "dev", ready, authenticated: !!user, user, login, logout, authFetch };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------- provider

export function GuardianAuthProvider({ children }: { children: ReactNode }) {
  if (authMode === "dev") return <DevAuthProvider>{children}</DevAuthProvider>;
  return (
    <TideCloakProvider config={tideConfig}>
      <TideBridge>{children}</TideBridge>
    </TideCloakProvider>
  );
}
