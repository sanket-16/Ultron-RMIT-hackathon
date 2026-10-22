/**
 * Postgres tables mirroring AuthorityStore (lib/authority/store.ts).
 * evidenceToken columns are text. payments.request_id is unique for idempotent addPayment.
 */
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import type {
  AnyRequestType,
  AuditKind,
  CircleRules,
  Decision,
  RequestStatus,
  Role,
} from "../lib/contracts";
import type { PolicyAuthorization } from "../lib/authority/store";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  username: text("username").notNull(),
  roles: jsonb("roles").$type<Role[]>().notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const policyVersions = pgTable(
  "policy_versions",
  {
    circleId: text("circle_id").notNull(),
    version: integer("version").notNull(),
    principalId: text("principal_id").notNull(),
    principalName: text("principal_name").notNull(),
    rules: jsonb("rules").$type<CircleRules>().notNull(),
    createdAt: text("created_at").notNull(),
    authorization: jsonb("authorization").$type<PolicyAuthorization>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.circleId, t.version] })],
);

export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull(),
  type: text("type").$type<AnyRequestType>().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  amountCents: integer("amount_cents"),
  payee: text("payee"),
  requesterId: text("requester_id").notNull(),
  requesterName: text("requester_name").notNull(),
  status: text("status").$type<RequestStatus>().notNull(),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
  policyVersion: integer("policy_version").notNull(),
  proposedRules: jsonb("proposed_rules").$type<CircleRules>(),
  principalEvidenceToken: text("principal_evidence_token"),
});

export const votes = pgTable("votes", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  memberId: text("member_id").notNull(),
  memberName: text("member_name").notNull(),
  decision: text("decision").$type<Decision>().notNull(),
  at: text("at").notNull(),
  evidenceToken: text("evidence_token").notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull(),
  requestId: text("request_id"),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  kind: text("kind").$type<AuditKind>().notNull(),
  message: text("message").notNull(),
  at: text("at").notNull(),
});

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  circleId: text("circle_id").notNull(),
  action: text("action").notNull(),
  amountCents: integer("amount_cents").notNull(),
  payee: text("payee").notNull(),
  at: text("at").notNull(),
  authorisedBy: jsonb("authorised_by").$type<string[]>().notNull(),
  mocked: boolean("mocked").notNull().default(true),
});
