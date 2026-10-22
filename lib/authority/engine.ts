/**
 * Emergent Authority for Guardian Circle.
 *
 * The rule: a protected action can only happen when enough real circle members have
 * approved it. "Real" means each approval carries a token signed by TideCloak's
 * distributed key (no admin, server or vendor holds it) and passes every check in
 * ./evidence.ts.
 *
 * Nothing here trusts a status column, a vote row or a policy row on its own. Every
 * decision re-derives authority from evidence, so a database edit cannot release funds
 * or quietly change Margaret's rules.
 */
import {
  CIRCLE_CHANGE,
  CircleRules,
  MIN_THRESHOLD,
  type AuditEventView,
  type AuditKind,
  type AuthorityView,
  type PaymentView,
} from "@/lib/contracts";
import { verifyPrincipalEvidence, verifyVoteEvidence } from "./evidence";
import { getAuthorityStore, type PolicyVersionRecord, type RequestRecord, type VoteRecord } from "./store";

// ---------------------------------------------------------------- audit

export type Actor = { id: string; displayName: string };
export const SYSTEM_ACTOR: Actor = { id: "system", displayName: "Guardian Circle" };

export async function audit(
  circleId: string,
  actor: Actor,
  kind: AuditKind,
  message: string,
  requestId?: string,
): Promise<void> {
  const event: AuditEventView = {
    id: crypto.randomUUID(),
    circleId,
    requestId,
    actorId: actor.id,
    actorName: actor.displayName,
    kind,
    message,
    at: new Date().toISOString(),
  };
  await getAuthorityStore().addAudit(event);
}

// ---------------------------------------------------------------- policy chain

export type VerifiedCircle = {
  circleId: string;
  principalId: string;
  principalName: string;
  /** Latest policy version that passed verification. Null = circle is locked. */
  current: PolicyVersionRecord | null;
  verified: PolicyVersionRecord[];
  tamperDetected: boolean;
  tamperReason?: string;
};

function canonicalRules(rules: unknown): string | null {
  const parsed = CircleRules.safeParse(rules);
  return parsed.success ? JSON.stringify(parsed.data) : null;
}

function checkRulesShape(v: PolicyVersionRecord): string | null {
  const parsed = CircleRules.safeParse(v.rules);
  if (!parsed.success) {
    if (typeof v.rules?.threshold === "number" && v.rules.threshold < MIN_THRESHOLD) {
      return `threshold ${v.rules.threshold} is below the minimum of ${MIN_THRESHOLD}`;
    }
    return "rules are not valid";
  }
  if (parsed.data.members.some((m) => m.memberId === v.principalId)) {
    return "the principal cannot be one of their own approvers";
  }
  return null;
}

/**
 * Replays the policy chain from the start. Version 1 must carry the principal's signed
 * evidence. Every later version must point at a circle_change request that the previous
 * version's circle approved, with exactly the same rules. The first version that fails
 * stops the chain; everything after it is ignored.
 */
export async function loadVerifiedCircle(circleId: string): Promise<VerifiedCircle | null> {
  const store = getAuthorityStore();
  const chain = await store.getPolicyChain(circleId);
  if (!chain.length) return null;

  const genesis = chain[0];
  const result: VerifiedCircle = {
    circleId,
    principalId: genesis.principalId,
    principalName: genesis.principalName,
    current: null,
    verified: [],
    tamperDetected: false,
  };
  const fail = (reason: string) => {
    result.tamperDetected = true;
    result.tamperReason = reason;
    return result;
  };

  for (let i = 0; i < chain.length; i++) {
    const v = chain[i];
    if (v.version !== i + 1) return fail(`policy version ${v.version} is out of sequence`);
    if (v.principalId !== genesis.principalId) return fail(`version ${v.version} changes who the principal is`);
    const shape = checkRulesShape(v);
    if (shape) return fail(`version ${v.version}: ${shape}`);

    if (i === 0) {
      if (v.authorization.kind !== "genesis") return fail("first version has no setup evidence");
      const ev = await verifyPrincipalEvidence(v.authorization.evidenceToken, v.principalId, v.createdAt);
      if (!ev.ok) return fail(`setup evidence rejected: ${ev.reason}`);
    } else {
      const prev = chain[i - 1];
      if (v.authorization.kind !== "circle_vote") {
        return fail(`version ${v.version} was not approved by the circle`);
      }
      const change = await store.getRequest(v.authorization.requestId);
      if (!change || change.type !== CIRCLE_CHANGE || change.circleId !== circleId) {
        return fail(`version ${v.version} points at a missing or wrong change request`);
      }
      if (change.policyVersion !== prev.version) {
        return fail(`version ${v.version} was approved against a different set of rules`);
      }
      if (canonicalRules(change.proposedRules) !== canonicalRules(v.rules)) {
        return fail(`version ${v.version} does not match what the circle approved`);
      }
      const authority = await evaluateUnder(change, prev);
      if (!authority.established) {
        return fail(`version ${v.version} lacks enough verified approvals (${authority.reason})`);
      }
    }
    result.verified.push(v);
    result.current = v;
  }
  return result;
}

export async function findCircleForUser(userId: string): Promise<VerifiedCircle | null> {
  const store = getAuthorityStore();
  for (const circleId of await store.listCircleIds()) {
    const circle = await loadVerifiedCircle(circleId);
    if (!circle) continue;
    if (circle.principalId === userId) return circle;
    if (circle.current?.rules.members.some((m) => m.memberId === userId)) return circle;
  }
  return null;
}

// ---------------------------------------------------------------- evaluating a request

export function needsCircle(
  r: Pick<RequestRecord, "type" | "amountCents" | "requesterId">,
  rules: CircleRules,
  principalId: string,
): { needed: boolean; why: string } {
  if (r.type === CIRCLE_CHANGE) return { needed: true, why: "changes to the circle need the circle" };
  if (r.requesterId !== principalId) return { needed: true, why: "asked for by someone other than the principal" };
  if ((rules.protectedTypes as string[]).includes(r.type)) return { needed: true, why: "this kind of decision is protected" };
  if ((r.amountCents ?? 0) > rules.dollarLimitCents) return { needed: true, why: "over the dollar limit" };
  return { needed: false, why: "small, everyday action" };
}

type Evaluation = AuthorityView & { approverIds: string[] };

/** Counts only votes whose evidence verifies under `policy`. */
async function evaluateUnder(request: RequestRecord, policy: PolicyVersionRecord): Promise<Evaluation> {
  const store = getAuthorityStore();
  const rules = policy.rules;
  const threshold = rules.threshold;
  const eligible = rules.members.filter((m) => m.memberId !== request.requesterId);
  const nameOf = (id: string) => rules.members.find((m) => m.memberId === id)?.displayName ?? id;

  const votes: VoteRecord[] = (await store.listVotes(request.id)).sort((a, b) => a.at.localeCompare(b.at));
  const counted = new Map<string, VoteRecord>();
  const rejectedVotes: AuthorityView["rejectedVotes"] = [];

  for (const vote of votes) {
    if (counted.has(vote.memberId)) {
      rejectedVotes.push({ memberId: vote.memberId, reason: "second vote from the same person" });
      continue;
    }
    const ev = await verifyVoteEvidence(vote, request, rules);
    if (!ev.ok) {
      rejectedVotes.push({ memberId: vote.memberId, reason: ev.reason });
      continue;
    }
    const uses = await store.findVotesByEvidenceToken(vote.evidenceToken);
    if (uses.some((u) => u.requestId !== request.id || u.id !== vote.id)) {
      rejectedVotes.push({ memberId: vote.memberId, reason: "same signed token reused for another vote (replayed)" });
      continue;
    }
    counted.set(vote.memberId, vote);
  }

  const approvals = [...counted.values()].filter((v) => v.decision === "approve");
  const declines = [...counted.values()].filter((v) => v.decision === "decline");
  const remaining = eligible.filter((m) => !counted.has(m.memberId)).length;
  const established = approvals.length >= threshold;
  const impossible = !established && approvals.length + remaining < threshold;

  const reason = established
    ? `${approvals.length} of ${threshold} required approvals verified`
    : impossible
      ? `cannot reach ${threshold} approvals (${declines.length} declined)`
      : `${approvals.length} of ${threshold} approvals so far`;

  return {
    established,
    threshold,
    eligibleVoters: eligible.length,
    approvals: approvals.map((v) => ({ memberId: v.memberId, displayName: nameOf(v.memberId), at: v.at })),
    declines: declines.map((v) => ({ memberId: v.memberId, displayName: nameOf(v.memberId), at: v.at })),
    rejectedVotes,
    impossible,
    reason,
    approverIds: approvals.map((v) => v.memberId),
  };
}

const locked = (reason: string, threshold = MIN_THRESHOLD): Evaluation => ({
  established: false,
  threshold,
  eligibleVoters: 0,
  approvals: [],
  declines: [],
  rejectedVotes: [],
  impossible: true,
  reason,
  approverIds: [],
});

/** The live answer to "is this request authorised right now?" */
export async function evaluateRequest(request: RequestRecord, circle: VerifiedCircle): Promise<Evaluation> {
  if (!circle.current) return locked("circle rules failed verification; everything is locked");

  if (request.type === CIRCLE_CHANGE) {
    const base = circle.verified.find((v) => v.version === request.policyVersion);
    if (!base) return locked("the rules this change was proposed against cannot be verified");
    if (base.version !== circle.current.version) {
      return locked("the circle has changed since this was proposed", base.rules.threshold);
    }
    return evaluateUnder(request, base);
  }

  const gate = needsCircle(request, circle.current.rules, circle.principalId);
  if (!gate.needed) {
    const ev = await verifyPrincipalEvidence(request.principalEvidenceToken, circle.principalId, request.createdAt);
    return ev.ok
      ? { ...locked(""), established: true, impossible: false, threshold: 0, reason: "Margaret's own everyday decision" }
      : locked(`no verified authority: ${ev.reason}`);
  }
  return evaluateUnder(request, circle.current);
}

// ---------------------------------------------------------------- carrying out (mocked)

/** Unforgeable inside this process: only this module can mint one. */
const proofs = new WeakSet<object>();
type AuthorityProof = { readonly requestId: string; readonly approverIds: string[] };

function issueProof(requestId: string, approverIds: string[]): AuthorityProof {
  const proof = Object.freeze({ requestId, approverIds: [...approverIds] });
  proofs.add(proof);
  return proof;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Mock payment rail / action executor. Refuses anything without a proof from this engine. */
async function executeMockAction(proof: AuthorityProof, request: RequestRecord): Promise<PaymentView | null> {
  if (!proofs.has(proof) || proof.requestId !== request.id) throw new Error("refusing to act without authority proof");
  const amountCents = request.amountCents ?? 0;
  const payee = request.payee ?? "Margaret's account";
  const action =
    amountCents > 0 ? `Paid ${formatCents(amountCents)} to ${payee}` : `Carried out: ${request.title}`;
  const payment = {
    id: crypto.randomUUID(),
    circleId: request.circleId,
    requestId: request.id,
    action,
    amountCents,
    payee,
    at: new Date().toISOString(),
    authorisedBy: proof.approverIds,
    mocked: true as const,
  };
  const created = await getAuthorityStore().addPayment(payment);
  return created ? payment : null; // null = already done (idempotent)
}

export type ReleaseOutcome =
  | { ok: true; authority: AuthorityView; payment?: PaymentView; newPolicyVersion?: number }
  | { ok: false; authority: AuthorityView; message: string };

/**
 * Try to carry out a request. Re-derives authority from evidence every time and ignores
 * whatever `status` says. Safe to call repeatedly.
 */
export async function releaseRequest(requestId: string, actor: Actor): Promise<ReleaseOutcome> {
  const store = getAuthorityStore();
  const request = await store.getRequest(requestId);
  if (!request) throw new Error("request not found");
  const circle = await loadVerifiedCircle(request.circleId);
  if (!circle) throw new Error("circle not found");

  const evaluation = await evaluateRequest(request, circle);
  const { approverIds, ...authority } = evaluation;

  if (!evaluation.established) {
    const tamper = authority.rejectedVotes.length > 0 || request.status === "approved";
    await audit(
      request.circleId,
      actor,
      "release_refused",
      `Refused to carry out "${request.title}": ${authority.reason}` +
        (authority.rejectedVotes.length ? `. Ignored ${authority.rejectedVotes.length} unverifiable vote(s).` : ""),
      request.id,
    );
    if (tamper) {
      await audit(
        request.circleId,
        SYSTEM_ACTOR,
        "tamper_detected",
        `Stored data says "${request.status}" but the signed approvals do not support it.`,
        request.id,
      );
    }
    return { ok: false, authority, message: "Not enough verified approvals. Nothing was carried out." };
  }

  const proof = issueProof(request.id, approverIds);

  if (request.type === CIRCLE_CHANGE) {
    if (!request.proposedRules) throw new Error("circle change without rules");
    const next = circle.current!.version + 1;
    const existing = (await store.getPolicyChain(circle.circleId)).find(
      (v) => v.authorization.kind === "circle_vote" && v.authorization.requestId === request.id,
    );
    if (!existing) {
      await store.appendPolicyVersion({
        circleId: circle.circleId,
        version: next,
        principalId: circle.principalId,
        principalName: circle.principalName,
        rules: request.proposedRules,
        createdAt: new Date().toISOString(),
        authorization: { kind: "circle_vote", requestId: request.id },
      });
      await store.updateRequest(request.id, { status: "approved", decidedAt: new Date().toISOString() });
      await audit(circle.circleId, actor, "circle_changed", `The circle approved new rules (version ${next}).`, request.id);
    }
    return { ok: true, authority, newPolicyVersion: existing?.version ?? next };
  }

  const payment = await executeMockAction(proof, request);
  const wasHeld = needsCircle(request, circle.current!.rules, circle.principalId).needed;
  if (payment) {
    await store.updateRequest(request.id, {
      status: wasHeld ? "approved" : "executed",
      decidedAt: payment.at,
    });
    await audit(request.circleId, actor, "funds_released", `${payment.action} (mocked).`, request.id);
  }
  return { ok: true, authority, payment: payment ?? (await store.getPayment(request.id)) ?? undefined };
}

/** Called after each vote: approve + carry out, decline, or keep holding. */
export async function settleRequest(requestId: string, actor: Actor): Promise<ReleaseOutcome | null> {
  const store = getAuthorityStore();
  const request = await store.getRequest(requestId);
  if (!request || request.status !== "held") return null;
  const circle = await loadVerifiedCircle(request.circleId);
  if (!circle) return null;
  const evaluation = await evaluateRequest(request, circle);

  if (evaluation.established) {
    await audit(request.circleId, SYSTEM_ACTOR, "request_approved", `"${request.title}" reached ${evaluation.reason}.`, request.id);
    return releaseRequest(requestId, actor);
  }
  if (evaluation.impossible) {
    await store.updateRequest(request.id, { status: "declined", decidedAt: new Date().toISOString() });
    await audit(request.circleId, SYSTEM_ACTOR, "request_declined", `"${request.title}" was blocked: ${evaluation.reason}.`, request.id);
  }
  const { approverIds: _ignored, ...authority } = evaluation;
  void _ignored;
  return { ok: false, authority, message: evaluation.impossible ? "Blocked by the circle." : "Still waiting for the circle." };
}
