"use client";

import { useCallback, useEffect, use, useState } from "react";
import type { Decision, RequestView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { StatusBadge } from "@/components/StatusBadge";
import { errorText, formatWhen, money, readApi, REQUEST_TYPE_LABELS } from "@/components/format";

type Outcome = "held" | "success" | "fail";

function outcomeFor(r: RequestView): Outcome {
  if (r.status === "approved" || r.status === "executed" || r.authority.established) return "success";
  if (r.status === "declined" || r.status === "cancelled" || r.authority.impossible) return "fail";
  return "held";
}

const HEADLINE: Record<Outcome, string> = {
  held: "Waiting on the circle",
  success: "Approved",
  fail: "Not going ahead",
};

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authFetch } = useGuardianAuth();
  const [request, setRequest] = useState<RequestView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchRequest = useCallback(async () => {
    const res = await authFetch(`/api/requests/${id}`);
    const parsed = await readApi<{ request: RequestView }>(res);
    if (!parsed.ok) {
      return { request: null as RequestView | null, error: errorText(parsed.error, parsed.details) };
    }
    return { request: parsed.data.request, error: null as string | null };
  }, [authFetch, id]);

  useEffect(() => {
    let alive = true;
    fetchRequest().then((d) => {
      if (!alive) return;
      setRequest(d.request);
      setError(d.error);
    });
    return () => {
      alive = false;
    };
  }, [fetchRequest]);

  async function vote(decision: Decision) {
    setBusy(true);
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
      setRequest(parsed.data.request);
    } finally {
      setBusy(false);
    }
  }

  if (request === undefined) {
    return <p className="text-lg text-muted">Loading request…</p>;
  }

  if (!request) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Request</h1>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}
      </section>
    );
  }

  const outcome = outcomeFor(request);
  const typeLabel =
    request.type === "circle_change"
      ? "Circle change"
      : REQUEST_TYPE_LABELS[request.type as keyof typeof REQUEST_TYPE_LABELS] ?? request.type;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{HEADLINE[outcome]}</h1>
          <StatusBadge status={request.status} />
        </div>
        <p className="text-lg text-accent">{request.authority.reason}</p>
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground">{request.title}</h2>
        <p className="text-lg text-muted">
          {typeLabel}
          {money(request.amountCents) ? ` · ${money(request.amountCents)}` : ""}
          {request.payee ? ` → ${request.payee}` : ""}
        </p>
        <p className="text-base text-muted">
          Asked by {request.requesterName} · {formatWhen(request.createdAt)}
        </p>
        {request.description && <p className="text-lg text-foreground">{request.description}</p>}
      </div>

      {request.payment && (
        <p className="rounded-2xl bg-accent-soft px-4 py-4 text-lg text-accent">{request.payment.action}</p>
      )}

      {(request.authority.approvals.length > 0 || request.authority.declines.length > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold">Votes</h3>
          {request.authority.approvals.map((a) => (
            <p key={`a-${a.memberId}`} className="text-lg text-accent">
              {a.displayName} approved · {formatWhen(a.at)}
            </p>
          ))}
          {request.authority.declines.map((a) => (
            <p key={`d-${a.memberId}`} className="text-lg text-rose-900">
              {a.displayName} declined · {formatWhen(a.at)}
            </p>
          ))}
        </div>
      )}

      {request.authority.rejectedVotes.length > 0 && (
        <ul className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">
          {request.authority.rejectedVotes.map((v, i) => (
            <li key={i}>
              Ignored vote ({v.memberId}): {v.reason}
            </li>
          ))}
        </ul>
      )}

      {request.myVote && (
        <p className="text-lg text-muted">
          You already {request.myVote === "approve" ? "approved" : "declined"} this request.
        </p>
      )}

      {request.canVote && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            className="h-14 flex-1 rounded-xl bg-accent text-lg font-medium text-surface disabled:opacity-50"
            onClick={() => vote("approve")}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-14 flex-1 rounded-xl bg-foreground text-lg font-medium text-surface disabled:opacity-50"
            onClick={() => vote("decline")}
          >
            Decline
          </button>
        </div>
      )}
    </section>
  );
}
