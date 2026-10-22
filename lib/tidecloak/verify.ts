/**
 * Server-side token verification. Every protected API calls `requireIdentity`.
 *
 * - Live requests (tide mode) go through `@tidecloak/verify`.
 * - Stored vote evidence is re-verified with `verifyTokenAt`, which applies the same
 *   rules but checks expiry against the moment the vote was cast.
 */
import { verifyTideCloakToken } from "@tidecloak/verify";
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest } from "next/server";
import { Role } from "@/lib/contracts";
import { authMode, tideConfig, tideIssuer, TOKEN_COOKIE } from "./config";
import { verifyDevToken } from "./dev";

export type Claims = JWTPayload & {
  preferred_username?: string;
  name?: string;
  given_name?: string;
  vuid?: string;
  tideuserkey?: string;
  azp?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
};

export type Identity = {
  id: string; // token `sub`
  username: string;
  displayName: string;
  roles: Role[];
  vuid?: string;
  /** The raw verified token. Stored as evidence when this person votes. */
  token: string;
  issuedAt: number; // seconds since epoch
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

const DEFAULT_ALGS = ["ES256", "ES384", "ES512", "EdDSA"];

type KeySet = Parameters<typeof jwtVerify>[1];
let cachedKeySet: KeySet | null = null;
function tideKeySet(): KeySet {
  if (!cachedKeySet) {
    cachedKeySet = tideConfig.jwk
      ? (createLocalJWKSet(tideConfig.jwk as Parameters<typeof createLocalJWKSet>[0]) as KeySet)
      : (createRemoteJWKSet(new URL(`${tideIssuer()}/protocol/openid-connect/certs`)) as KeySet);
  }
  return cachedKeySet;
}

/** Verify a token as if it were `at` (defaults to now). Returns null if invalid. */
export async function verifyTokenAt(token: string, at?: Date): Promise<Claims | null> {
  if (!token) return null;
  if (authMode === "dev") return (await verifyDevToken(token, at)) as Claims | null;

  if (!at) {
    return (await verifyTideCloakToken(tideConfig, token)) as Claims | null;
  }
  try {
    const { payload } = await jwtVerify(token, tideKeySet(), {
      issuer: tideIssuer(),
      algorithms: tideConfig.tokenSignatureAlgorithms?.length ? tideConfig.tokenSignatureAlgorithms : DEFAULT_ALGS,
      clockTolerance: tideConfig.clockTolerance ?? "5s",
      currentDate: at,
    });
    const client = tideConfig.resource;
    if (client && payload.azp !== client) return null;
    return payload as Claims;
  } catch {
    return null;
  }
}

export function rolesFromClaims(claims: Claims): Role[] {
  const client = tideConfig.resource;
  const all = new Set<string>([
    ...(claims.realm_access?.roles ?? []),
    ...((client && claims.resource_access?.[client]?.roles) || []),
  ]);
  return Role.options.filter((r) => all.has(r));
}

export function identityFromClaims(claims: Claims, token: string): Identity | null {
  if (!claims.sub) return null;
  const username = claims.preferred_username ?? claims.sub;
  return {
    id: claims.sub,
    username,
    displayName: claims.name ?? claims.given_name ?? username,
    roles: rolesFromClaims(claims),
    vuid: claims.vuid,
    token,
    issuedAt: claims.iat ?? 0,
  };
}

export function tokenFromRequest(req: NextRequest | Request): string | null {
  const header = req.headers.get("authorization");
  if (header) {
    const [scheme, value] = header.split(" ");
    if (value && /^(bearer|dpop)$/i.test(scheme)) return value.trim();
  }
  if ("cookies" in req && typeof req.cookies?.get === "function") {
    return req.cookies.get(TOKEN_COOKIE)?.value ?? null;
  }
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getIdentity(req: NextRequest | Request): Promise<Identity | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const claims = await verifyTokenAt(token);
  return claims ? identityFromClaims(claims, token) : null;
}

/** Throws 401 if not signed in, 403 if none of `anyOfRoles` is present. */
export async function requireIdentity(req: NextRequest | Request, anyOfRoles: Role[] = []): Promise<Identity> {
  const identity = await getIdentity(req);
  if (!identity) throw new HttpError(401, "Please sign in again.");
  if (anyOfRoles.length && !anyOfRoles.some((r) => identity.roles.includes(r))) {
    throw new HttpError(403, `This needs one of these roles: ${anyOfRoles.join(", ")}.`);
  }
  return identity;
}
