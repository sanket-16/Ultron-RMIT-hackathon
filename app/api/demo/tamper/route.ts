/**
 * SECURITY DEMO: pretend to be a rogue database admin (or James with DB access).
 *
 *   mode "votes"  -> mark the request "approved" and insert fake approval rows for every
 *                    member, plus replay any real old token we can find.
 *   mode "policy" -> sneak in a new policy row with threshold 1.
 *   mode "undo"   -> remove everything this route inserted.
 *
 * Then it asks the engine to release the request. It is refused, because the engine only
 * counts approvals backed by TideCloak-signed tokens, and nobody can mint those alone.
 */
import { SignJWT, generateKeyPair } from "jose";
import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/authority/http";
import { audit, findCircleForUser, releaseRequest } from "@/lib/authority/engine";
import { getAuthorityStore } from "@/lib/authority/store";
import { getRequest } from "@/lib/authority/service";
import { HttpError } from "@/lib/tidecloak/verify";
import { authMode, tideIssuer } from "@/lib/tidecloak/config";
import { DEV_ISSUER } from "@/lib/tidecloak/dev";

const Input = z.object({
  mode: z.enum(["votes", "policy", "undo"]).default("votes"),
  requestId: z.string().optional(),
});

const FORGED = "forged-";
const g = globalThis as unknown as { __guardianTamperStatus?: Map<string, string> };
const originalStatus = (g.__guardianTamperStatus ??= new Map());

async function forgeToken(sub: string) {
  // A token that *looks* right: right subject, right role, right issuer, fresh time.
  // It is signed with a key the attacker made up, because that's all they can do.
  const { privateKey } = await generateKeyPair("ES256");
  return new SignJWT({ realm_access: { roles: ["circle_member"] }, preferred_username: sub })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setSubject(sub)
    .setIssuer(authMode === "dev" ? DEV_ISSUER : tideIssuer())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

export const POST = withAuth([], async (req, me) => {
  if (process.env.GUARDIAN_ENABLE_TAMPER_DEMO !== "1") throw new HttpError(404, "Tamper demo is turned off.");
  const { mode, requestId } = await parseBody(req, Input);
  const store = getAuthorityStore();
  const circle = await findCircleForUser(me.id);
  if (!circle?.current) throw new HttpError(404, "No verified circle.");
  const actor = { id: me.id, displayName: `${me.displayName} (acting as database admin)` };

  if (mode === "undo") {
    await store.rawTamper((db) => {
      db.votes.splice(0, db.votes.length, ...db.votes.filter((v) => !v.id.startsWith(FORGED)));
      db.policies.splice(
        0,
        db.policies.length,
        ...db.policies.filter((p) => !(p.authorization.kind === "circle_vote" && p.authorization.requestId.startsWith(FORGED))),
      );
      for (const r of db.requests) {
        const s = originalStatus.get(r.id);
        if (s) r.status = s as typeof r.status;
      }
    });
    originalStatus.clear();
    return json({ undone: true });
  }

  if (mode === "policy") {
    const rules = { ...circle.current.rules, threshold: 1 };
    await store.rawTamper((db) => {
      db.policies.push({
        ...circle.current!,
        version: circle.current!.version + 1,
        rules,
        createdAt: new Date().toISOString(),
        authorization: { kind: "circle_vote", requestId: `${FORGED}${crypto.randomUUID()}` },
      });
    });
    await audit(circle.circleId, actor, "tamper_simulated", "Inserted a policy row lowering the threshold to 1.");
    const after = await findCircleForUser(me.id);
    return json({
      tampered: "policy",
      effectiveThreshold: after?.current?.rules.threshold,
      tamperDetected: after?.tamperDetected,
      tamperReason: after?.tamperReason,
    });
  }

  // mode === "votes"
  if (!requestId) throw new HttpError(400, "requestId is required.");
  const target = await store.getRequest(requestId);
  if (!target || target.circleId !== circle.circleId) throw new HttpError(404, "Request not found.");

  const allVotes = await Promise.all((await store.listRequests(circle.circleId)).map((r) => store.listVotes(r.id)));
  const realOldTokens = new Map(allVotes.flat().filter((v) => v.requestId !== requestId).map((v) => [v.memberId, v.evidenceToken]));

  const forgedVotes = await Promise.all(
    circle.current.rules.members
      .filter((m) => m.memberId !== target.requesterId)
      .map(async (m) => ({
        id: `${FORGED}${crypto.randomUUID()}`,
        requestId,
        memberId: m.memberId,
        memberName: m.displayName,
        decision: "approve" as const,
        at: new Date().toISOString(),
        // Replay a real signed token if one exists, otherwise forge one.
        evidenceToken: realOldTokens.get(m.memberId) ?? (await forgeToken(m.memberId)),
      })),
  );

  await store.rawTamper((db) => {
    db.votes.splice(0, db.votes.length, ...db.votes.filter((v) => v.requestId !== requestId || !v.id.startsWith(FORGED)));
    db.votes.push(...forgedVotes);
    const row = db.requests.find((r) => r.id === requestId)!;
    if (!originalStatus.has(row.id)) originalStatus.set(row.id, row.status);
    row.status = "approved";
  });
  await audit(
    circle.circleId,
    actor,
    "tamper_simulated",
    `Set "${target.title}" to approved in the database and inserted ${forgedVotes.length} fake approval(s).`,
    requestId,
  );

  const outcome = await releaseRequest(requestId, actor);
  const paid = await store.getPayment(requestId);
  return json(
    {
      tampered: "votes",
      released: outcome.ok,
      fundsMoved: !!paid && !paid.id.startsWith(FORGED) && outcome.ok,
      message: outcome.ok ? "Released (this should not happen)." : outcome.message,
      rejectedVotes: outcome.authority.rejectedVotes,
      request: await getRequest(me, requestId),
    },
    outcome.ok ? 200 : 403,
  );
});
