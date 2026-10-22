/**
 * Use-cases behind the API routes. Routes stay thin: parse input, call one of these.
 */
import {
  CIRCLE_CHANGE,
  type CircleChangeInput,
  type CircleRules,
  type CircleView,
  type CreateRequestInput,
  type Decision,
  type RequestView,
  type UserSummary,
} from "@/lib/contracts";
import { HttpError, type Identity } from "@/lib/tidecloak/verify";
import {
  audit,
  evaluateRequest,
  findCircleForUser,
  loadVerifiedCircle,
  needsCircle,
  releaseRequest,
  settleRequest,
  type VerifiedCircle,
} from "./engine";
import { getAuthorityStore, type RequestRecord } from "./store";

const actorOf = (me: Identity) => ({ id: me.id, displayName: me.displayName });

/** Remember who has signed in, so the principal can pick them as circle members. */
export async function recordUser(me: Identity): Promise<void> {
  await getAuthorityStore().upsertUser({
    id: me.id,
    username: me.username,
    displayName: me.displayName,
    roles: me.roles,
    lastSeenAt: new Date().toISOString(),
  });
}

export async function listKnownUsers(): Promise<UserSummary[]> {
  const users = await getAuthorityStore().listUsers();
  return users.map(({ id, username, displayName, roles }) => ({ id, username, displayName, roles }));
}

async function requireCircle(me: Identity): Promise<VerifiedCircle> {
  const circle = await findCircleForUser(me.id);
  if (!circle) throw new HttpError(404, "You are not part of a circle yet.");
  return circle;
}

// ---------------------------------------------------------------- circle

export function toCircleView(circle: VerifiedCircle): CircleView {
  const rules = circle.current?.rules;
  return {
    circleId: circle.circleId,
    principalId: circle.principalId,
    principalName: circle.principalName,
    version: circle.current?.version ?? 0,
    members: rules?.members ?? [],
    policy: {
      threshold: rules?.threshold ?? 0,
      memberCount: rules?.members.length ?? 0,
      dollarLimitCents: rules?.dollarLimitCents ?? 0,
      protectedTypes: rules?.protectedTypes ?? [],
    },
    tamperDetected: circle.tamperDetected,
    tamperReason: circle.tamperReason,
  };
}

export async function getMyCircle(me: Identity): Promise<CircleView | null> {
  const circle = await findCircleForUser(me.id);
  return circle ? toCircleView(circle) : null;
}

/** First-time setup. Only the principal, only once. Later changes need the circle. */
export async function setupCircle(me: Identity, rules: CircleRules): Promise<CircleView> {
  if (!me.roles.includes("principal")) throw new HttpError(403, "Only the person the circle protects can set it up.");
  if (await findCircleForUser(me.id)) {
    throw new HttpError(409, "Your circle already exists. Changes now need your circle's approval.");
  }
  if (rules.members.some((m) => m.memberId === me.id)) {
    throw new HttpError(400, "You can't be one of your own approvers.");
  }
  const circleId = `circle-${me.id}`;
  const store = getAuthorityStore();
  await store.appendPolicyVersion({
    circleId,
    version: 1,
    principalId: me.id,
    principalName: me.displayName,
    rules,
    createdAt: new Date().toISOString(),
    authorization: { kind: "genesis", evidenceToken: me.token },
  });
  await audit(
    circleId,
    actorOf(me),
    "circle_created",
    `${me.displayName} set up a circle of ${rules.members.length}: ${rules.threshold} must agree on big decisions.`,
  );
  const circle = await loadVerifiedCircle(circleId);
  return toCircleView(circle!);
}

export async function proposeCircleChange(me: Identity, input: CircleChangeInput): Promise<RequestView> {
  const circle = await requireCircle(me);
  if (!circle.current) throw new HttpError(423, "Circle rules failed verification; changes are locked.");
  if (input.rules.members.some((m) => m.memberId === circle.principalId)) {
    throw new HttpError(400, "The principal can't be one of their own approvers.");
  }
  const record: RequestRecord = {
    id: crypto.randomUUID(),
    circleId: circle.circleId,
    type: CIRCLE_CHANGE,
    title: "Change the circle",
    description: input.reason,
    requesterId: me.id,
    requesterName: me.displayName,
    status: "held",
    createdAt: new Date().toISOString(),
    policyVersion: circle.current.version,
    proposedRules: input.rules,
  };
  await getAuthorityStore().createRequest(record);
  await audit(circle.circleId, actorOf(me), "request_created", `${me.displayName} proposed changing the circle.`, record.id);
  await audit(circle.circleId, actorOf(me), "request_held", `Held: changes to the circle need ${circle.current.rules.threshold} approvals.`, record.id);
  return toRequestView(record, circle, me);
}

// ---------------------------------------------------------------- requests

export async function toRequestView(r: RequestRecord, circle: VerifiedCircle, me: Identity): Promise<RequestView> {
  const store = getAuthorityStore();
  const evaluation = await evaluateRequest(r, circle);
  const { approverIds: _a, ...authority } = evaluation;
  void _a;
  const votes = await store.listVotes(r.id);
  const myVote = votes.find((v) => v.memberId === me.id)?.decision;
  const isMember = !!circle.current?.rules.members.some((m) => m.memberId === me.id);
  const stored = await store.getPayment(r.id);
  let payment: RequestView["payment"];
  if (stored) {
    const { circleId: _c, ...rest } = stored;
    void _c;
    payment = rest;
  }
  return {
    id: r.id,
    circleId: r.circleId,
    type: r.type,
    title: r.title,
    description: r.description,
    amountCents: r.amountCents,
    payee: r.payee,
    requesterId: r.requesterId,
    requesterName: r.requesterName,
    status: r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    policyVersion: r.policyVersion,
    proposedRules: r.proposedRules,
    authority,
    payment,
    myVote,
    canVote: r.status === "held" && isMember && me.roles.includes("circle_member") && r.requesterId !== me.id && !myVote,
  };
}

export async function listRequests(me: Identity): Promise<RequestView[]> {
  const circle = await findCircleForUser(me.id);
  if (!circle) return [];
  const records = await getAuthorityStore().listRequests(circle.circleId);
  return Promise.all(records.map((r) => toRequestView(r, circle, me)));
}

async function loadRequestFor(me: Identity, id: string) {
  const store = getAuthorityStore();
  const record = await store.getRequest(id);
  const circle = await findCircleForUser(me.id);
  if (!record || !circle || record.circleId !== circle.circleId) throw new HttpError(404, "Request not found.");
  return { record, circle };
}

export async function getRequest(me: Identity, id: string): Promise<RequestView> {
  const { record, circle } = await loadRequestFor(me, id);
  return toRequestView(record, circle, me);
}

/** Small everyday actions by the principal go straight through; everything else is held. */
export async function createRequest(me: Identity, input: CreateRequestInput): Promise<RequestView> {
  const circle = await requireCircle(me);
  if (!circle.current) throw new HttpError(423, "Circle rules failed verification; everything is locked.");
  const store = getAuthorityStore();
  const record: RequestRecord = {
    id: crypto.randomUUID(),
    circleId: circle.circleId,
    type: input.type,
    title: input.title,
    description: input.description,
    amountCents: input.amountCents,
    payee: input.payee,
    requesterId: me.id,
    requesterName: me.displayName,
    status: "held",
    createdAt: new Date().toISOString(),
    policyVersion: circle.current.version,
  };
  const gate = needsCircle(record, circle.current.rules, circle.principalId);
  if (!gate.needed) record.principalEvidenceToken = me.token;

  await store.createRequest(record);
  await audit(circle.circleId, actorOf(me), "request_created", `${me.displayName} asked: ${record.title}.`, record.id);

  if (gate.needed) {
    await audit(
      circle.circleId,
      actorOf(me),
      "request_held",
      `Held (${gate.why}). Needs ${circle.current.rules.threshold} approvals from the circle.`,
      record.id,
    );
  } else {
    const outcome = await releaseRequest(record.id, actorOf(me));
    if (outcome.ok) {
      await audit(circle.circleId, actorOf(me), "request_executed", `No approval needed (${gate.why}).`, record.id);
    }
  }
  const fresh = (await store.getRequest(record.id))!;
  return toRequestView(fresh, circle, me);
}

export async function castVote(me: Identity, id: string, decision: Decision): Promise<RequestView> {
  const { record, circle } = await loadRequestFor(me, id);
  const store = getAuthorityStore();
  if (record.status !== "held") throw new HttpError(409, `This request is already ${record.status}.`);
  if (!me.roles.includes("circle_member")) throw new HttpError(403, "Only circle members can vote.");
  if (!circle.current?.rules.members.some((m) => m.memberId === me.id)) {
    throw new HttpError(403, "You are not a member of this circle.");
  }
  if (record.requesterId === me.id) throw new HttpError(403, "You can't vote on your own request.");
  const votes = await store.listVotes(id);
  if (votes.some((v) => v.memberId === me.id)) throw new HttpError(409, "You have already voted on this.");
  if (me.issuedAt * 1000 + 5_000 < Date.parse(record.createdAt)) {
    throw new HttpError(401, "Please confirm it's you again (your sign-in is older than this request).", {
      code: "fresh_token_required",
    });
  }
  if ((await store.findVotesByEvidenceToken(me.token)).length) {
    throw new HttpError(401, "Please confirm it's you again (each vote needs a fresh sign-in token).", {
      code: "fresh_token_required",
    });
  }

  await store.addVote({
    id: crypto.randomUUID(),
    requestId: id,
    memberId: me.id,
    memberName: me.displayName,
    decision,
    at: new Date().toISOString(),
    evidenceToken: me.token,
  });
  await audit(
    circle.circleId,
    actorOf(me),
    "vote_recorded",
    `${me.displayName} ${decision === "approve" ? "approved" : "declined"} "${record.title}".`,
    id,
  );
  await settleRequest(id, actorOf(me));
  return getRequest(me, id);
}

export async function cancelRequest(me: Identity, id: string): Promise<RequestView> {
  const { record, circle } = await loadRequestFor(me, id);
  if (record.status !== "held") throw new HttpError(409, `This request is already ${record.status}.`);
  if (record.requesterId !== me.id && circle.principalId !== me.id) {
    throw new HttpError(403, "Only the person who asked, or the principal, can cancel this.");
  }
  await getAuthorityStore().updateRequest(id, { status: "cancelled", decidedAt: new Date().toISOString() });
  await audit(circle.circleId, actorOf(me), "request_cancelled", `${me.displayName} cancelled "${record.title}".`, id);
  return getRequest(me, id);
}

export async function tryRelease(me: Identity, id: string) {
  await loadRequestFor(me, id); // access check
  const outcome = await releaseRequest(id, actorOf(me));
  return { outcome, request: await getRequest(me, id) };
}

export async function listAudit(me: Identity) {
  const circle = await findCircleForUser(me.id);
  if (!circle) return [];
  return getAuthorityStore().listAudit(circle.circleId);
}
