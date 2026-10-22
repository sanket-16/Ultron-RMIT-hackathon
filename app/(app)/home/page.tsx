"use client";

import { useCallback, useEffect, useState } from "react";
import type { CircleView, Decision, RequestView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { RequestCard } from "@/components/RequestCard";
import { errorText, readApi } from "@/components/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

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

  const reload = useCallback(() => {
    setCircle(undefined);
    setError(null);
    fetchHome().then(apply);
  }, [fetchHome, apply]);

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
    return <LoadingBlock label="Loading your circle…" />;
  }

  const isPrincipal = !!user?.roles.includes("principal");
  const pending = requests.filter((r) => r.status === "held");
  const recent = requests.filter((r) => r.status !== "held").slice(0, 8);

  if (!circle) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Welcome</h1>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {isPrincipal ? (
          <EmptyState
            title="No circle yet"
            body="Set up your circle so trusted people can help with big decisions."
            actionHref="/setup"
            actionLabel="Set up your circle"
          />
        ) : (
          <EmptyState
            title="Waiting for Margaret…"
            body="Margaret has not set up a circle yet. Once she does, you will see requests here."
          />
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Home</h1>
        <p className="text-lg text-muted">
          {circle.principalName}&apos;s circle · {circle.policy.threshold} of {circle.policy.memberCount} must agree
        </p>
        {circle.tamperDetected && (
          <ErrorBanner
            message={`The saved rules look wrong. We are using the last trusted rules${
              circle.tamperReason ? `: ${circle.tamperReason}` : "."
            }`}
          />
        )}
      </header>

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Waiting for a decision</h2>
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting" body="No requests need a decision right now." />
        ) : (
          pending.map((r) => (
            <div key={r.id} className="flex flex-col gap-3">
              <RequestCard request={r} />
              {r.canVote && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="h-14 flex-1 rounded-md bg-accent text-lg font-medium text-surface disabled:opacity-50"
                    onClick={() => vote(r.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="h-14 flex-1 rounded-md bg-foreground text-lg font-medium text-surface disabled:opacity-50"
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
        <h2 className="text-xl font-semibold text-foreground">Recent</h2>
        {recent.length === 0 ? (
          <EmptyState title="No earlier requests" body="Finished requests will show up here." />
        ) : (
          recent.map((r) => <RequestCard key={r.id} request={r} />)
        )}
      </div>
    </section>
  );
}
