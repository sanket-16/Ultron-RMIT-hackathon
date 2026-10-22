"use client";

/**
 * Authority console: Person A's test bench for every protected API, and the place to
 * run the "admin can't override" demo. Person B's real screens live in app/(app)/.
 */
import { useCallback, useEffect, useState } from "react";
import type { AuditEventView, CircleView, RequestView, UserSummary } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";

const money = (c?: number) => (c == null ? "" : `$${(c / 100).toLocaleString("en-AU")}`);

export default function ProtectedPage() {
  const { user, logout, authFetch, mode } = useGuardianAuth();
  const [circle, setCircle] = useState<CircleView | null>(null);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [candidates, setCandidates] = useState<UserSummary[]>([]);
  const [note, setNote] = useState<string>("");

  const fetchAll = useCallback(async () => {
    const [c, r, a] = await Promise.all([
      authFetch("/api/circle").then((x) => x.json()),
      authFetch("/api/requests").then((x) => x.json()),
      authFetch("/api/audit").then((x) => x.json()),
    ]);
    const k = user?.roles.includes("principal")
      ? await authFetch("/api/circle/candidates").then((x) => x.json())
      : { candidates: [] };
    return { circle: c.circle ?? null, requests: r.requests ?? [], events: a.events ?? [], candidates: k.candidates ?? [] };
  }, [authFetch, user]);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchAll>>) => {
    setCircle(d.circle);
    setRequests(d.requests);
    setEvents(d.events);
    setCandidates(d.candidates);
  }, []);

  const load = useCallback(async () => apply(await fetchAll()), [apply, fetchAll]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchAll().then((d) => alive && apply(d));
    return () => {
      alive = false;
    };
  }, [user, fetchAll, apply]);

  async function call(url: string, body?: unknown, fresh = false) {
    const res = await authFetch(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }, { fresh });
    const data = await res.json().catch(() => ({}));
    setNote(`${res.status} ${data.error ?? data.message ?? (res.ok ? "OK" : "")}`);
    await load();
    return data;
  }

  if (!user) return <p className="p-8">Loading…</p>;

  return (
    <main className="mx-auto w-full max-w-3xl p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Authority console</h1>
          <p className="text-zinc-600">
            {user.displayName} · {user.roles.join(", ") || "no roles"} · {mode} mode
          </p>
        </div>
        <button className="h-11 px-4 rounded-lg border" onClick={() => logout()}>
          Sign out
        </button>
      </header>
      {note && <p className="rounded-lg bg-zinc-100 p-3 font-mono text-sm">{note}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Circle</h2>
        {circle ? (
          <div className={`rounded-lg border p-3 ${circle.tamperDetected ? "border-red-500" : ""}`}>
            <p>
              {circle.principalName}&apos;s circle (v{circle.version}): {circle.policy.threshold} of{" "}
              {circle.policy.memberCount} must agree · limit {money(circle.policy.dollarLimitCents)} · protected:{" "}
              {circle.policy.protectedTypes.join(", ") || "none"}
            </p>
            <p className="text-zinc-600">{circle.members.map((m) => `${m.displayName} (${m.relationship ?? "member"})`).join(", ")}</p>
            {circle.tamperDetected && <p className="text-red-600">Tampering detected and ignored: {circle.tamperReason}</p>}
          </div>
        ) : user.roles.includes("principal") ? (
          <div className="flex flex-col gap-2">
            <p>
              No circle yet. Candidates who have signed in:{" "}
              {candidates.map((c) => c.displayName).join(", ") || "none — sign in as the members first"}
            </p>
            <button
              className="h-12 rounded-lg bg-teal-700 text-white disabled:opacity-40"
              disabled={candidates.length < 2}
              onClick={() =>
                call("/api/circle", {
                  members: candidates.slice(0, 3).map((c) => ({ memberId: c.id, displayName: c.displayName })),
                  threshold: 2,
                  dollarLimitCents: 500_000,
                  protectedTypes: ["sell_home", "change_will", "care_home_move"],
                })
              }
            >
              Set up: first 3 candidates, 2 of 3, $5,000 limit
            </button>
          </div>
        ) : (
          <p>You are not in a circle yet.</p>
        )}
      </section>

      {circle && (
        <section className="flex flex-wrap gap-2">
          <button
            className="h-11 px-3 rounded-lg border"
            onClick={() =>
              call("/api/requests", { type: "large_withdrawal", title: "Invest for Mum", amountCents: 8_000_000, payee: "J. Investments" })
            }
          >
            Ask: $80,000 &quot;invest for Mum&quot;
          </button>
          <button
            className="h-11 px-3 rounded-lg border"
            onClick={() =>
              call("/api/requests", { type: "care_home_move", title: "Care home invoice", amountCents: 1_200_000, payee: "Rosewood Care" })
            }
          >
            Ask: $12,000 care-home invoice
          </button>
          <button
            className="h-11 px-3 rounded-lg border"
            onClick={() => call("/api/requests", { type: "other", title: "Groceries", amountCents: 12_000, payee: "Local grocer" })}
          >
            Ask: $120 groceries
          </button>
          <button className="h-11 px-3 rounded-lg border border-red-400" onClick={() => call("/api/demo/tamper", { mode: "policy" })}>
            DB admin: set threshold to 1
          </button>
          <button className="h-11 px-3 rounded-lg border" onClick={() => call("/api/demo/tamper", { mode: "undo" })}>
            Undo tampering
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Requests</h2>
        {requests.map((r) => (
          <article key={r.id} className="rounded-lg border p-3 flex flex-col gap-2">
            <div className="flex justify-between gap-2">
              <strong>
                {r.title} {money(r.amountCents)}
              </strong>
              <span className="font-mono text-sm">
                stored: {r.status} · authority: {r.authority.established ? "YES" : "no"}
              </span>
            </div>
            <p className="text-sm text-zinc-600">
              Asked by {r.requesterName} · {r.authority.reason}
              {r.authority.approvals.length > 0 && ` · approved: ${r.authority.approvals.map((a) => a.displayName).join(", ")}`}
              {r.authority.declines.length > 0 && ` · declined: ${r.authority.declines.map((a) => a.displayName).join(", ")}`}
            </p>
            {r.authority.rejectedVotes.length > 0 && (
              <ul className="text-sm text-red-600">
                {r.authority.rejectedVotes.map((v, i) => (
                  <li key={i}>
                    Ignored vote for {v.memberId}: {v.reason}
                  </li>
                ))}
              </ul>
            )}
            {r.payment && <p className="text-sm text-teal-700">{r.payment.action} (mocked)</p>}
            <div className="flex flex-wrap gap-2">
              {r.canVote && (
                <>
                  <button className="h-11 px-4 rounded-lg bg-teal-700 text-white" onClick={() => call(`/api/requests/${r.id}/votes`, { decision: "approve" }, true)}>
                    Approve
                  </button>
                  <button className="h-11 px-4 rounded-lg bg-zinc-800 text-white" onClick={() => call(`/api/requests/${r.id}/votes`, { decision: "decline" }, true)}>
                    Decline
                  </button>
                </>
              )}
              <button className="h-11 px-3 rounded-lg border" onClick={() => call(`/api/requests/${r.id}/release`)}>
                Try to release
              </button>
              {r.status === "held" && (
                <button className="h-11 px-3 rounded-lg border" onClick={() => call(`/api/requests/${r.id}/cancel`)}>
                  Cancel
                </button>
              )}
              <button className="h-11 px-3 rounded-lg border border-red-400" onClick={() => call("/api/demo/tamper", { mode: "votes", requestId: r.id })}>
                DB admin: mark approved + fake votes
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Audit trail</h2>
        {events.map((e) => (
          <p key={e.id} className="text-sm">
            <span className="text-zinc-500">{new Date(e.at).toLocaleTimeString()}</span> {e.message}
          </p>
        ))}
      </section>
    </main>
  );
}
