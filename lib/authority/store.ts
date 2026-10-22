/**
 * Storage for the authority layer.
 *
 * Nothing in here is trusted. Statuses, policy rows and votes are a mirror for the UI.
 * The engine (./engine.ts) re-derives authority from signed evidence on every decision,
 * so editing these records cannot release funds.
 *
 * Person B: implement `AuthorityStore` with Drizzle and call `setAuthorityStore()`
 * at startup (e.g. in lib/db/index.ts). The in-memory version is the default.
 */
import type {
  AnyRequestType,
  AuditEventView,
  CircleRules,
  Decision,
  PaymentView,
  RequestStatus,
  UserSummary,
} from "@/lib/contracts";

export type PolicyAuthorization =
  /** First setup: the principal's own verified token. */
  | { kind: "genesis"; evidenceToken: string }
  /** Later changes: a circle_change request the previous circle approved. */
  | { kind: "circle_vote"; requestId: string };

export type PolicyVersionRecord = {
  circleId: string;
  version: number;
  principalId: string;
  principalName: string;
  rules: CircleRules;
  createdAt: string;
  authorization: PolicyAuthorization;
};

export type RequestRecord = {
  id: string;
  circleId: string;
  type: AnyRequestType;
  title: string;
  description?: string;
  amountCents?: number;
  payee?: string;
  requesterId: string;
  requesterName: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt?: string;
  /** Policy version in force when the request was made. */
  policyVersion: number;
  proposedRules?: CircleRules;
  /** Principal's verified token, for actions that never needed the circle. */
  principalEvidenceToken?: string;
};

export type VoteRecord = {
  id: string;
  requestId: string;
  memberId: string;
  memberName: string;
  decision: Decision;
  at: string;
  /** The voter's Tide-signed access token at the moment they voted. */
  evidenceToken: string;
};

export type UserRecord = UserSummary & { lastSeenAt: string };

export interface AuthorityStore {
  upsertUser(user: UserRecord): Promise<void>;
  listUsers(): Promise<UserRecord[]>;

  listCircleIds(): Promise<string[]>;
  getPolicyChain(circleId: string): Promise<PolicyVersionRecord[]>;
  appendPolicyVersion(v: PolicyVersionRecord): Promise<void>;

  createRequest(r: RequestRecord): Promise<void>;
  getRequest(id: string): Promise<RequestRecord | null>;
  listRequests(circleId: string): Promise<RequestRecord[]>;
  updateRequest(id: string, patch: Partial<RequestRecord>): Promise<void>;

  addVote(v: VoteRecord): Promise<void>;
  listVotes(requestId: string): Promise<VoteRecord[]>;
  /** All votes (any request) that carry this exact evidence token. Used to catch replays. */
  findVotesByEvidenceToken(token: string): Promise<VoteRecord[]>;

  addAudit(e: AuditEventView): Promise<void>;
  listAudit(circleId: string): Promise<AuditEventView[]>;

  /** Must be idempotent per requestId: return false if a payment already exists. */
  addPayment(p: PaymentView & { circleId: string }): Promise<boolean>;
  getPayment(requestId: string): Promise<(PaymentView & { circleId: string }) | null>;
  listPayments(circleId: string): Promise<(PaymentView & { circleId: string })[]>;

  /**
   * DEMO ONLY: raw access, like a database admin running SQL by hand.
   * Used by /api/demo/tamper to prove that editing rows does nothing.
   */
  rawTamper(fn: (data: RawData) => void): Promise<void>;
}

export type RawData = {
  policies: PolicyVersionRecord[];
  requests: RequestRecord[];
  votes: VoteRecord[];
};

class MemoryStore implements AuthorityStore {
  users = new Map<string, UserRecord>();
  policies: PolicyVersionRecord[] = [];
  requests: RequestRecord[] = [];
  votes: VoteRecord[] = [];
  audit: AuditEventView[] = [];
  payments: (PaymentView & { circleId: string })[] = [];

  async upsertUser(user: UserRecord) {
    this.users.set(user.id, user);
  }
  async listUsers() {
    return [...this.users.values()];
  }
  async listCircleIds() {
    return [...new Set(this.policies.map((p) => p.circleId))];
  }
  async getPolicyChain(circleId: string) {
    return this.policies.filter((p) => p.circleId === circleId).sort((a, b) => a.version - b.version);
  }
  async appendPolicyVersion(v: PolicyVersionRecord) {
    if (this.policies.some((p) => p.circleId === v.circleId && p.version === v.version)) {
      throw new Error("policy version already exists");
    }
    this.policies.push(structuredClone(v));
  }
  async createRequest(r: RequestRecord) {
    this.requests.push(structuredClone(r));
  }
  async getRequest(id: string) {
    const r = this.requests.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }
  async listRequests(circleId: string) {
    return this.requests
      .filter((r) => r.circleId === circleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => structuredClone(r));
  }
  async updateRequest(id: string, patch: Partial<RequestRecord>) {
    const r = this.requests.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async addVote(v: VoteRecord) {
    this.votes.push(structuredClone(v));
  }
  async listVotes(requestId: string) {
    return this.votes.filter((v) => v.requestId === requestId).map((v) => structuredClone(v));
  }
  async findVotesByEvidenceToken(token: string) {
    return this.votes.filter((v) => v.evidenceToken === token).map((v) => structuredClone(v));
  }
  async addAudit(e: AuditEventView) {
    this.audit.push(e);
  }
  async listAudit(circleId: string) {
    return this.audit.filter((e) => e.circleId === circleId).reverse(); // newest first
  }
  async addPayment(p: PaymentView & { circleId: string }) {
    if (this.payments.some((x) => x.requestId === p.requestId)) return false;
    this.payments.push(p);
    return true;
  }
  async getPayment(requestId: string) {
    return this.payments.find((p) => p.requestId === requestId) ?? null;
  }
  async listPayments(circleId: string) {
    return this.payments.filter((p) => p.circleId === circleId);
  }
  async rawTamper(fn: (data: RawData) => void) {
    fn({ policies: this.policies, requests: this.requests, votes: this.votes });
  }
}

// Survive Next.js hot reloads in dev.
const g = globalThis as unknown as { __guardianStore?: AuthorityStore };

export function getAuthorityStore(): AuthorityStore {
  if (!g.__guardianStore) g.__guardianStore = new MemoryStore();
  return g.__guardianStore;
}

export function setAuthorityStore(store: AuthorityStore) {
  g.__guardianStore = store;
}
