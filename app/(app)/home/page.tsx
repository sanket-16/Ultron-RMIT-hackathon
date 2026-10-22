"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CircleView, Decision, RequestView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { RequestCard } from "@/components/RequestCard";
import { errorText, readApi } from "@/components/format";

export default function HomePage() {
  const { user, authFetch } = useGuardianAuth();
  const [circle, setCircle] = useState<CircleView | null | undefined>(undefined);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchHome = useCallback(async () => {
    const [cRes, rRes] = await Promise.all([authFetch("/api/circle"), authFetch("/api/requests")]);
    const c = await readApi<{ circle: CircleView | null }>(cRes);
    const r = await readApi<{ requests: RequestView[] }>(rRes);
    if (!c.ok) {
      return { circle: null as CircleView | null, requests: [] as RequestView[], error: errorText(c.error, c.details) };
    }
    if (!r.ok) {
      return { circle: c.data.circle, requests: [] as RequestView[], error: errorText(r.error, r.details) };
    }
    return { circle: c.data.circle, requests: r.data.requests ?? [], error: null as string | null };
  }, [authFetch]);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchHome>>) => {
    setCircle(d.circle);
    setRequests(d.requests);
    setError(d.error);
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchHome().then((d) => {
      if (alive) apply(d);
    });
    return () => {
      alive = false;
    };
  }, [user, fetchHome, apply]);

  async function vote(id: string, decision: Decision) {
    setBusyId(id);
    setError(null);
    try {
      const res = await authFetch(
        `/api/requests/${id}/votes`,
        { method: "POST", body: JSON.stringify({ decision }) },
        { fresh: true },
      );
      const parsed = await readApi<{ request: RequestView }>(res);
      if (!parsed.ok) {
        setError(errorText(parsed.error, parsed.details));
        return;
      }
      apply(await fetchHome());
    } finally {
      setBusyId(null);
    }
  }

  if (circle === undefined) {
    return <p className="text-lg text-zinc-600">Loading your circle…</p>;
  }

  const isPrincipal = !!user?.roles.includes("principal");
  const pending = requests.filter((r) => r.status === "held");
  const recent = requests.filter((r) => r.status !== "held").slice(0, 8);

  if (!circle) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Welcome</h1>
        {isPrincipal ? (
          <>
            <p className="text-lg text-zinc-700">Set up your circle so trusted people can help with big decisions.</p>
            <Link
              href="/setup"
              className="flex h-14 items-center justify-center rounded-xl bg-teal-700 text-lg font-medium text-white"
            >
              Set up your circle
            </Link>
          </>
        ) : (
          <p className="text-lg text-zinc-700">
            You are not in a circle yet. Ask the account holder to add you, then refresh this page.
          </p>
        )}
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Home</h1>
        <p className="text-lg text-zinc-700">
          {circle.principalName}&apos;s circle · {circle.policy.threshold} of {circle.policy.memberCount} must agree
        </p>
        {circle.tamperDetected && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">
            Stored rules look wrong. We are using the last verified rules
            {circle.tamperReason ? `: ${circle.tamperReason}` : "."}
          </p>
        )}
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-zinc-900">Waiting for a decision</h2>
        {pending.length === 0 ? (
          <p className="text-lg text-zinc-600">Nothing waiting right now.</p>
        ) : (
          pending.map((r) => (
            <div key={r.id} className="flex flex-col gap-3">
              <RequestCard request={r} />
              {r.canVote && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="h-14 flex-1 rounded-xl bg-teal-700 text-lg font-medium text-white disabled:opacity-50"
                    onClick={() => vote(r.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="h-14 flex-1 rounded-xl bg-zinc-800 text-lg font-medium text-white disabled:opacity-50"
                    onClick={() => vote(r.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-zinc-900">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-lg text-zinc-600">No earlier requests yet.</p>
        ) : (
          recent.map((r) => <RequestCard key={r.id} request={r} />)
        )}
      </div>
    </section>
  );
}
