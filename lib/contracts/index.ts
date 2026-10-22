/**
 * Shared contracts between Person A (authority / APIs) and Person B (UI / Drizzle).
 * Keep these shapes stable: Person B can mock against them, Person A enforces them.
 */
import { z } from "zod";

// 1. Roles (TideCloak realm or client roles)
export const Role = z.enum(["principal", "circle_member", "requester"]);
export type Role = z.infer<typeof Role>;

// 2. Request types a person can ask for
export const RequestType = z.enum([
  "large_withdrawal",
  "sell_home",
  "change_will",
  "care_home_move",
  "other",
]);
export type RequestType = z.infer<typeof RequestType>;

/** Internal type used when the circle itself (members / rules) is being changed. */
export const CIRCLE_CHANGE = "circle_change" as const;
export const AnyRequestType = z.union([RequestType, z.literal(CIRCLE_CHANGE)]);
export type AnyRequestType = z.infer<typeof AnyRequestType>;

// 3. Statuses: held -> approved | declined | cancelled
// "completed" = approved by the circle and the (mocked) action was carried out.
// "executed" = never held (small, everyday action by the principal) and carried out.
export const RequestStatus = z.enum(["held", "approved", "declined", "cancelled", "executed"]);
export type RequestStatus = z.infer<typeof RequestStatus>;

// 4. Vote
export const Decision = z.enum(["approve", "decline"]);
export type Decision = z.infer<typeof Decision>;

export const Vote = z.object({
  requestId: z.string(),
  memberId: z.string(),
  decision: Decision,
  at: z.string(), // ISO timestamp
});
export type Vote = z.infer<typeof Vote>;

// 5. Policy mirror (UI only; Person A enforces the real thing)
export const CircleMember = z.object({
  memberId: z.string().min(1), // TideCloak user id (token `sub`)
  displayName: z.string().min(1).max(80),
  relationship: z.string().max(40).optional(), // "daughter", "son", "friend"...
});
export type CircleMember = z.infer<typeof CircleMember>;

export const PolicyMirror = z.object({
  threshold: z.number().int(),
  memberCount: z.number().int(),
  dollarLimitCents: z.number().int().nonnegative(),
  protectedTypes: z.array(RequestType),
});
export type PolicyMirror = z.infer<typeof PolicyMirror>;

/** Hard floor enforced in code. A DB edit cannot lower it. */
export const MIN_THRESHOLD = 2;

export const CircleRules = z
  .object({
    members: z.array(CircleMember).min(MIN_THRESHOLD).max(7),
    threshold: z.number().int().min(MIN_THRESHOLD),
    dollarLimitCents: z.number().int().nonnegative().max(100_000_000_00),
    protectedTypes: z.array(RequestType),
  })
  .refine((r) => r.threshold <= r.members.length, {
    message: "threshold cannot be larger than the number of members",
    path: ["threshold"],
  })
  .refine((r) => new Set(r.members.map((m) => m.memberId)).size === r.members.length, {
    message: "members must be unique",
    path: ["members"],
  });
export type CircleRules = z.infer<typeof CircleRules>;

// ---------- API inputs ----------

/** POST /api/circle — first-time setup by the principal. */
export const CircleSetupInput = CircleRules;
export type CircleSetupInput = CircleRules;

/** POST /api/circle/proposals — propose new members / rules; the circle must approve. */
export const CircleChangeInput = z.object({
  rules: CircleRules,
  reason: z.string().max(500).optional(),
});
export type CircleChangeInput = z.infer<typeof CircleChangeInput>;

/** POST /api/requests */
export const CreateRequestInput = z.object({
  type: RequestType,
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  amountCents: z.number().int().nonnegative().max(100_000_000_00).optional(),
  payee: z.string().max(120).optional(),
});
export type CreateRequestInput = z.infer<typeof CreateRequestInput>;

/** POST /api/requests/:id/votes */
export const VoteInput = z.object({ decision: Decision });
export type VoteInput = z.infer<typeof VoteInput>;

// ---------- API outputs ----------

export type UserSummary = {
  id: string;
  displayName: string;
  username: string;
  roles: Role[];
};

export type AuthorityView = {
  /** True only when verified, Tide-signed approvals meet the verified threshold. */
  established: boolean;
  threshold: number;
  eligibleVoters: number;
  approvals: { memberId: string; displayName: string; at: string }[];
  declines: { memberId: string; displayName: string; at: string }[];
  /** Votes found in storage that failed verification (forged / tampered / not a member). */
  rejectedVotes: { memberId: string; reason: string }[];
  /** True when approval can no longer be reached. */
  impossible: boolean;
  reason: string;
};

export type RequestView = {
  id: string;
  circleId: string;
  type: AnyRequestType;
  title: string;
  description?: string;
  amountCents?: number;
  payee?: string;
  requesterId: string;
  requesterName: string;
  /** Mirror status from storage (what the UI shows). */
  status: RequestStatus;
  createdAt: string;
  decidedAt?: string;
  policyVersion: number;
  /** Proposed rules, only for circle_change requests. */
  proposedRules?: CircleRules;
  /** Computed fresh from evidence on every read. Trust this, not `status`. */
  authority: AuthorityView;
  payment?: PaymentView;
  myVote?: Decision;
  canVote: boolean;
};

/** Record of a (mocked) action that was carried out: a payment, a sale, a will change... */
export type PaymentView = {
  id: string;
  requestId: string;
  /** Plain description, e.g. "Paid $12,000.00 to Rosewood Care". */
  action: string;
  amountCents: number;
  payee: string;
  at: string;
  /** Who authorised it: ids of the members whose verified approvals released it. */
  authorisedBy: string[];
  mocked: true;
};

export const AuditKind = z.enum([
  "circle_created",
  "circle_changed",
  "request_created",
  "request_held",
  "request_executed",
  "vote_recorded",
  "request_approved",
  "request_declined",
  "request_cancelled",
  "funds_released",
  "release_refused",
  "tamper_simulated",
  "tamper_detected",
]);
export type AuditKind = z.infer<typeof AuditKind>;

export type AuditEventView = {
  id: string;
  circleId: string;
  requestId?: string;
  actorId: string;
  actorName: string;
  kind: AuditKind;
  message: string;
  at: string;
};

export type CircleView = {
  circleId: string;
  principalId: string;
  principalName: string;
  version: number;
  members: CircleMember[];
  /** The verified policy (from the approval chain), not the raw DB row. */
  policy: PolicyMirror;
  /** Set when stored policy rows don't match the approval chain. */
  tamperDetected: boolean;
  tamperReason?: string;
};

export type ApiError = { error: string; details?: unknown };
