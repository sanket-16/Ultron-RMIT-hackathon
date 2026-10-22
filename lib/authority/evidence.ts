/**
 * Checks that a stored vote is backed by a real, Tide-signed token from a real member.
 * A row in the database is not enough: the token's signature, subject, roles and
 * timing must all line up.
 */
import type { CircleRules } from "@/lib/contracts";
import { verifyTokenAt, rolesFromClaims, type Claims } from "@/lib/tidecloak/verify";
import type { RequestRecord, VoteRecord } from "./store";

const SKEW_MS = 5_000;

export type EvidenceResult = { ok: true; claims: Claims } | { ok: false; reason: string };

export async function verifyVoteEvidence(
  vote: VoteRecord,
  request: RequestRecord,
  rules: CircleRules,
): Promise<EvidenceResult> {
  const at = new Date(vote.at);
  if (Number.isNaN(at.getTime())) return { ok: false, reason: "vote time is invalid" };

  const claims = await verifyTokenAt(vote.evidenceToken, at);
  if (!claims) return { ok: false, reason: "signature not valid (not issued by TideCloak)" };
  if (claims.sub !== vote.memberId) return { ok: false, reason: "token belongs to someone else" };
  if (!rolesFromClaims(claims).includes("circle_member")) {
    return { ok: false, reason: "TideCloak does not list this person as a circle member" };
  }
  if (!rules.members.some((m) => m.memberId === vote.memberId)) {
    return { ok: false, reason: "not a member of this circle" };
  }
  if (vote.memberId === request.requesterId) {
    return { ok: false, reason: "people cannot approve their own request" };
  }
  const issuedMs = (claims.iat ?? 0) * 1000;
  if (issuedMs + SKEW_MS < Date.parse(request.createdAt)) {
    return { ok: false, reason: "token was issued before the request existed (replayed)" };
  }
  if (issuedMs > at.getTime() + SKEW_MS) {
    return { ok: false, reason: "token was issued after the vote time (back-dated row)" };
  }
  return { ok: true, claims };
}

/** The principal's own token, used for genesis and for small, everyday actions. */
export async function verifyPrincipalEvidence(
  token: string | undefined,
  principalId: string,
  atIso: string,
): Promise<EvidenceResult> {
  if (!token) return { ok: false, reason: "no signed evidence from the principal" };
  const at = new Date(atIso);
  const claims = await verifyTokenAt(token, at);
  if (!claims) return { ok: false, reason: "principal signature not valid" };
  if (claims.sub !== principalId) return { ok: false, reason: "evidence is not from the principal" };
  if (!rolesFromClaims(claims).includes("principal")) {
    return { ok: false, reason: "TideCloak does not list this person as the principal" };
  }
  if ((claims.iat ?? 0) * 1000 > at.getTime() + SKEW_MS) {
    return { ok: false, reason: "evidence was issued after the action (back-dated row)" };
  }
  return { ok: true, claims };
}
