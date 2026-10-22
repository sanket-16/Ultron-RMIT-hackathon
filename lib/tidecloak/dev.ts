/**
 * DEV MODE ONLY. Lets the team build and demo before the TideCloak realm exists.
 * Tokens are signed with a local secret, so whoever holds GUARDIAN_DEV_SECRET could forge
 * them. In "tide" mode this file is unused: tokens are signed by Tide's network and no
 * single server or admin holds that key.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/lib/contracts";

export const DEV_ISSUER = "guardian-circle-dev";

export type DevUser = {
  id: string;
  username: string;
  name: string;
  relationship?: string;
  roles: Role[];
};

/** Demo cast from the story. Person B's seed should use the same ids in dev mode. */
export const DEV_USERS: DevUser[] = [
  { id: "dev-margaret", username: "margaret", name: "Margaret", roles: ["principal"] },
  { id: "dev-sarah", username: "sarah", name: "Sarah", relationship: "daughter", roles: ["circle_member"] },
  { id: "dev-james", username: "james", name: "James", relationship: "son", roles: ["circle_member", "requester"] },
  { id: "dev-helen", username: "helen", name: "Helen", relationship: "family friend", roles: ["circle_member"] },
  // Not in the circle. Useful to show that unknown people's votes are rejected.
  { id: "dev-mallory", username: "mallory", name: "Mallory", relationship: "stranger", roles: ["requester"] },
];

function devSecret(): Uint8Array {
  const secret = process.env.GUARDIAN_DEV_SECRET || "guardian-circle-dev-secret-do-not-use-in-production";
  return new TextEncoder().encode(secret);
}

export async function mintDevToken(user: DevUser, ttlSeconds = 60 * 60): Promise<string> {
  return new SignJWT({
    preferred_username: user.username,
    name: user.name,
    realm_access: { roles: user.roles },
    azp: "guardian-circle-dev",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(DEV_ISSUER)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(devSecret());
}

export async function verifyDevToken(token: string, at?: Date): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, devSecret(), {
      issuer: DEV_ISSUER,
      algorithms: ["HS256"],
      clockTolerance: 5,
      currentDate: at,
    });
    return payload;
  } catch {
    return null;
  }
}
