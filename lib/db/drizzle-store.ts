/**
 * AuthorityStore backed by Neon Postgres via Drizzle.
 * Nothing here is trusted — same contract as MemoryStore.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  auditEvents,
  payments,
  policyVersions,
  requests,
  users,
  votes,
} from "@/drizzle/schema";
import type {
  AuditEventView,
  PaymentView,
} from "@/lib/contracts";
import type {
  AuthorityStore,
  PolicyVersionRecord,
  RawData,
  RequestRecord,
  UserRecord,
  VoteRecord,
} from "@/lib/authority/store";
import { getDb, type Db } from "./index";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e.code === "23505" || e.cause?.code === "23505" || Boolean(e.message?.includes("duplicate key"));
}

export class DrizzleAuthorityStore implements AuthorityStore {
  private db(): Db {
    return getDb();
  }

  async upsertUser(user: UserRecord): Promise<void> {
    const db = this.db();
    await db
      .insert(users)
      .values({
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        roles: user.roles,
        lastSeenAt: user.lastSeenAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          displayName: user.displayName,
          username: user.username,
          roles: user.roles,
          lastSeenAt: user.lastSeenAt,
        },
      });
  }

  async listUsers(): Promise<UserRecord[]> {
    const rows = await this.db().select().from(users);
    return rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      username: r.username,
      roles: r.roles,
      lastSeenAt: r.lastSeenAt,
    }));
  }

  async listCircleIds(): Promise<string[]> {
    const rows = await this.db().select({ circleId: policyVersions.circleId }).from(policyVersions);
    return [...new Set(rows.map((r) => r.circleId))];
  }

  async getPolicyChain(circleId: string): Promise<PolicyVersionRecord[]> {
    const rows = await this.db()
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.circleId, circleId));
    return rows
      .map((r) => ({
        circleId: r.circleId,
        version: r.version,
        principalId: r.principalId,
        principalName: r.principalName,
        rules: r.rules,
        createdAt: r.createdAt,
        authorization: r.authorization,
      }))
      .sort((a, b) => a.version - b.version);
  }

  async appendPolicyVersion(v: PolicyVersionRecord): Promise<void> {
    try {
      await this.db().insert(policyVersions).values({
        circleId: v.circleId,
        version: v.version,
        principalId: v.principalId,
        principalName: v.principalName,
        rules: v.rules,
        createdAt: v.createdAt,
        authorization: v.authorization,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error("policy version already exists");
      throw err;
    }
  }

  async createRequest(r: RequestRecord): Promise<void> {
    await this.db().insert(requests).values({
      id: r.id,
      circleId: r.circleId,
      type: r.type,
      title: r.title,
      description: r.description ?? null,
      amountCents: r.amountCents ?? null,
      payee: r.payee ?? null,
      requesterId: r.requesterId,
      requesterName: r.requesterName,
      status: r.status,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt ?? null,
      policyVersion: r.policyVersion,
      proposedRules: r.proposedRules ?? null,
      principalEvidenceToken: r.principalEvidenceToken ?? null,
    });
  }

  async getRequest(id: string): Promise<RequestRecord | null> {
    const [row] = await this.db().select().from(requests).where(eq(requests.id, id)).limit(1);
    return row ? rowToRequest(row) : null;
  }

  async listRequests(circleId: string): Promise<RequestRecord[]> {
    const rows = await this.db().select().from(requests).where(eq(requests.circleId, circleId));
    return rows.map(rowToRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateRequest(id: string, patch: Partial<RequestRecord>): Promise<void> {
    const set: Partial<typeof requests.$inferInsert> = {};
    if (patch.circleId !== undefined) set.circleId = patch.circleId;
    if (patch.type !== undefined) set.type = patch.type;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.description !== undefined) set.description = patch.description ?? null;
    if (patch.amountCents !== undefined) set.amountCents = patch.amountCents ?? null;
    if (patch.payee !== undefined) set.payee = patch.payee ?? null;
    if (patch.requesterId !== undefined) set.requesterId = patch.requesterId;
    if (patch.requesterName !== undefined) set.requesterName = patch.requesterName;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.createdAt !== undefined) set.createdAt = patch.createdAt;
    if (patch.decidedAt !== undefined) set.decidedAt = patch.decidedAt ?? null;
    if (patch.policyVersion !== undefined) set.policyVersion = patch.policyVersion;
    if (patch.proposedRules !== undefined) set.proposedRules = patch.proposedRules ?? null;
    if (patch.principalEvidenceToken !== undefined) {
      set.principalEvidenceToken = patch.principalEvidenceToken ?? null;
    }
    if (Object.keys(set).length === 0) return;
    await this.db().update(requests).set(set).where(eq(requests.id, id));
  }

  async addVote(v: VoteRecord): Promise<void> {
    await this.db().insert(votes).values({
      id: v.id,
      requestId: v.requestId,
      memberId: v.memberId,
      memberName: v.memberName,
      decision: v.decision,
      at: v.at,
      evidenceToken: v.evidenceToken,
    });
  }

  async listVotes(requestId: string): Promise<VoteRecord[]> {
    const rows = await this.db().select().from(votes).where(eq(votes.requestId, requestId));
    return rows.map(rowToVote);
  }

  async findVotesByEvidenceToken(token: string): Promise<VoteRecord[]> {
    const rows = await this.db().select().from(votes).where(eq(votes.evidenceToken, token));
    return rows.map(rowToVote);
  }

  async addAudit(e: AuditEventView): Promise<void> {
    await this.db().insert(auditEvents).values({
      id: e.id,
      circleId: e.circleId,
      requestId: e.requestId ?? null,
      actorId: e.actorId,
      actorName: e.actorName,
      kind: e.kind,
      message: e.message,
      at: e.at,
    });
  }

  async listAudit(circleId: string): Promise<AuditEventView[]> {
    const rows = await this.db()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.circleId, circleId))
      .orderBy(desc(auditEvents.at));
    return rows.map((r) => ({
      id: r.id,
      circleId: r.circleId,
      requestId: r.requestId ?? undefined,
      actorId: r.actorId,
      actorName: r.actorName,
      kind: r.kind,
      message: r.message,
      at: r.at,
    }));
  }

  async addPayment(p: PaymentView & { circleId: string }): Promise<boolean> {
    const existing = await this.getPayment(p.requestId);
    if (existing) return false;
    try {
      await this.db().insert(payments).values({
        id: p.id,
        requestId: p.requestId,
        circleId: p.circleId,
        action: p.action,
        amountCents: p.amountCents,
        payee: p.payee,
        at: p.at,
        authorisedBy: p.authorisedBy,
        mocked: true,
      });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }

  async getPayment(requestId: string): Promise<(PaymentView & { circleId: string }) | null> {
    const [row] = await this.db().select().from(payments).where(eq(payments.requestId, requestId)).limit(1);
    return row ? rowToPayment(row) : null;
  }

  async listPayments(circleId: string): Promise<(PaymentView & { circleId: string })[]> {
    const rows = await this.db().select().from(payments).where(eq(payments.circleId, circleId));
    return rows.map(rowToPayment);
  }

  /**
   * DEMO ONLY: load policies/requests/votes, let the callback mutate them like MemoryStore,
   * then persist the diff so /api/demo/tamper works against real rows.
   */
  async rawTamper(fn: (data: RawData) => void): Promise<void> {
    const db = this.db();
    const [policyRows, requestRows, voteRows] = await Promise.all([
      db.select().from(policyVersions),
      db.select().from(requests),
      db.select().from(votes),
    ]);

    const data: RawData = {
      policies: policyRows.map((r) => ({
        circleId: r.circleId,
        version: r.version,
        principalId: r.principalId,
        principalName: r.principalName,
        rules: structuredClone(r.rules),
        createdAt: r.createdAt,
        authorization: structuredClone(r.authorization),
      })),
      requests: requestRows.map((r) => rowToRequest(r)),
      votes: voteRows.map((r) => rowToVote(r)),
    };

    const beforePolicyKeys = new Set(data.policies.map((p) => policyKey(p)));
    const beforeVoteIds = new Set(data.votes.map((v) => v.id));
    const beforeRequestStatus = new Map(data.requests.map((r) => [r.id, r.status]));

    fn(data);

    const afterPolicyKeys = new Set(data.policies.map((p) => policyKey(p)));
    const afterVoteIds = new Set(data.votes.map((v) => v.id));

    for (const key of beforePolicyKeys) {
      if (afterPolicyKeys.has(key)) continue;
      const [circleId, versionStr] = key.split("\0");
      await db
        .delete(policyVersions)
        .where(and(eq(policyVersions.circleId, circleId!), eq(policyVersions.version, Number(versionStr))));
    }
    for (const p of data.policies) {
      if (beforePolicyKeys.has(policyKey(p))) continue;
      await db.insert(policyVersions).values({
        circleId: p.circleId,
        version: p.version,
        principalId: p.principalId,
        principalName: p.principalName,
        rules: p.rules,
        createdAt: p.createdAt,
        authorization: p.authorization,
      });
    }

    for (const id of beforeVoteIds) {
      if (afterVoteIds.has(id)) continue;
      await db.delete(votes).where(eq(votes.id, id));
    }
    for (const v of data.votes) {
      if (beforeVoteIds.has(v.id)) continue;
      await db.insert(votes).values({
        id: v.id,
        requestId: v.requestId,
        memberId: v.memberId,
        memberName: v.memberName,
        decision: v.decision,
        at: v.at,
        evidenceToken: v.evidenceToken,
      });
    }

    for (const r of data.requests) {
      const prev = beforeRequestStatus.get(r.id);
      if (prev !== undefined && prev !== r.status) {
        await db.update(requests).set({ status: r.status }).where(eq(requests.id, r.id));
      }
    }
  }
}

function policyKey(p: Pick<PolicyVersionRecord, "circleId" | "version">): string {
  return `${p.circleId}\0${p.version}`;
}

function rowToRequest(r: typeof requests.$inferSelect): RequestRecord {
  return {
    id: r.id,
    circleId: r.circleId,
    type: r.type,
    title: r.title,
    description: r.description ?? undefined,
    amountCents: r.amountCents ?? undefined,
    payee: r.payee ?? undefined,
    requesterId: r.requesterId,
    requesterName: r.requesterName,
    status: r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt ?? undefined,
    policyVersion: r.policyVersion,
    proposedRules: r.proposedRules ?? undefined,
    principalEvidenceToken: r.principalEvidenceToken ?? undefined,
  };
}

function rowToVote(r: typeof votes.$inferSelect): VoteRecord {
  return {
    id: r.id,
    requestId: r.requestId,
    memberId: r.memberId,
    memberName: r.memberName,
    decision: r.decision,
    at: r.at,
    evidenceToken: r.evidenceToken,
  };
}

function rowToPayment(r: typeof payments.$inferSelect): PaymentView & { circleId: string } {
  return {
    id: r.id,
    requestId: r.requestId,
    circleId: r.circleId,
    action: r.action,
    amountCents: r.amountCents,
    payee: r.payee,
    at: r.at,
    authorisedBy: r.authorisedBy,
    mocked: true,
  };
}
