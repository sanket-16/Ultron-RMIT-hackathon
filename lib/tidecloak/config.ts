import adapter from "@/tidecloak.json";

export type TideAdapterConfig = {
  realm: string;
  "auth-server-url": string;
  resource?: string;
  "public-client"?: boolean;
  jwk?: { keys: Array<Record<string, unknown> & { kid: string; kty: string }> };
  vendorId?: string;
  homeOrkUrl?: string;
  tokenSignatureAlgorithms?: string[];
  clockTolerance?: number | string;
  [key: string]: unknown;
};

export const tideConfig = adapter as unknown as TideAdapterConfig;

/** True until someone replaces tidecloak.json with the real downloaded adapter. */
export const tideConfigIsPlaceholder = "_placeholder" in (adapter as Record<string, unknown>);

export type AuthMode = "tide" | "dev";

function resolveAuthMode(): AuthMode {
  const env = process.env.NEXT_PUBLIC_GUARDIAN_AUTH_MODE;
  if (env === "tide" || env === "dev") return env;
  return tideConfigIsPlaceholder ? "dev" : "tide";
}

/** Same value on server and client (NEXT_PUBLIC_ is inlined at build time). */
export const authMode: AuthMode = resolveAuthMode();

export function tideIssuer(config: TideAdapterConfig = tideConfig): string {
  const base = config["auth-server-url"];
  return `${base}${base.endsWith("/") ? "" : "/"}realms/${config.realm}`;
}

export const TOKEN_COOKIE = "kcToken";
