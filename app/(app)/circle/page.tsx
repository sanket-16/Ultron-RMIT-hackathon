"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CircleView, RequestType, RequestView, UserSummary } from "@/lib/contracts";
import { MIN_THRESHOLD, RequestType as RequestTypeEnum } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, money, readApi, REQUEST_TYPE_LABELS } from "@/components/format";

const ALL_TYPES = RequestTypeEnum.options;

export default function CirclePage() {
  const { user, authFetch } = useGuardianAuth();
  const router = useRouter();
  const canPropose = !!user?.roles.some((r) => r === "principal" || r === "circle_member");

  const [circle, setCircle] = useState<CircleView | null | undefined>(undefined);
  const [candidates, setCandidates] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Record<string, { on: boolean; relationship: string; displayName: string }>>(
    {},
  );
  const [threshold, setThreshold] = useState(MIN_THRESHOLD);
  const [limitDollars, setLimitDollars] = useState("5000");
  const [protectedTypes, setProtectedTypes] = useState<RequestType[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCircle = useCallback(async () => {
    const [cRes, kRes] = await Promise.all([authFetch("/api/circle"), authFetch("/api/circle/candidates")]);
    const c = await readApi<{ circle: CircleView | null }>(cRes);
    const k = await readApi<{ candidates: UserSummary[] }>(kRes);
    if (!c.ok) {
      return {
        circle: null as CircleView | null,
        candidates: [] as UserSummary[],
        error: errorText(c.error, c.details),
      };
    }
    if (!k.ok) {
      return {
        circle: c.data.circle,
        candidates: [] as UserSummary[],
        error: errorText(k.error, k.details),
      };
    }
    return { circle: c.data.circle, candidates: k.data.candidates ?? [], error: null as string | null };
  }, [authFetch]);

  useEffect(() => {
    if (!user || !canPropose) return;
    let alive = true;
    fetchCircle().then((d) => {
      if (!alive) return;
      setCircle(d.circle);
      setCandidates(d.candidates);
      setError(d.error);
      if (!d.circle) return;
      setThreshold(d.circle.policy.threshold);
      setLimitDollars(String(d.circle.policy.dollarLimitCents / 100));
      setProtectedTypes([...d.circle.policy.protectedTypes]);
      setSelected(() => {
        const next: Record<string, { on: boolean; relationship: string; displayName: string }> = {};
        for (const m of d.circle!.members) {
          next[m.memberId] = {
            on: true,
            relationship: m.relationship ?? "",
            displayName: m.displayName,
          };
        }
        for (const cand of d.candidates) {
          if (!next[cand.id]) {
            next[cand.id] = { on: false, relationship: "", displayName: cand.displayName };
          }
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [user, canPropose, fetchCircle]);

  useEffect(() => {
    if (circle === null) router.replace("/setup");
  }, [circle, router]);

  const people = useMemo(() => {
    const byId = new Map<string, { id: string; displayName: string; username?: string }>();
    if (circle) {
      for (const m of circle.members) {
        byId.set(m.memberId, { id: m.memberId, displayName: m.displayName });
      }
    }
    for (const c of candidates) {
      byId.set(c.id, { id: c.id, displayName: c.displayName, username: c.username });
    }
    return Array.from(byId.values());
  }, [circle, candidates]);

  const members = useMemo(
    () =>
      people
        .filter((p) => selected[p.id]?.on)
        .map((p) => ({
          memberId: p.id,
          displayName: selected[p.id]?.displayName || p.displayName,
          relationship: selected[p.id]?.relationship.trim() || undefined,
        })),
    [people, selected],
  );

  const cappedThreshold = Math.min(Math.max(threshold, MIN_THRESHOLD), Math.max(members.length, MIN_THRESHOLD));

  if (!canPropose) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Circle</h1>
        <p className="text-lg text-muted">Only the account holder or a circle member can propose rule changes.</p>
      </section>
    );
  }

  if (circle === undefined) {
    return <p className="text-lg text-muted">Loading…</p>;
  }

  if (!circle) {
    return <p className="text-lg text-muted">Opening setup…</p>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (members.length < MIN_THRESHOLD) {
      setError(`Pick at least ${MIN_THRESHOLD} people.`);
      return;
    }
    const dollars = Number(limitDollars.replace(/,/g, ""));
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Enter a valid everyday dollar limit.");
      return;
    }
    const nextThreshold = Math.min(Math.max(threshold, MIN_THRESHOLD), members.length);
    setSaving(true);
    try {
      const res = await authFetch("/api/circle/proposals", {
        method: "POST",
        body: JSON.stringify({
          rules: {
            members,
            threshold: nextThreshold,
            dollarLimitCents: Math.round(dollars * 100),
            protectedTypes,
          },
          reason: reason.trim() || undefined,
        }),
      });
      const parsed = await readApi<{ request: RequestView }>(res);
      if (!parsed.ok) {
        setError(errorText(parsed.error, parsed.details));
        return;
      }
      router.replace(`/requests/${parsed.data.request.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Circle</h1>
        <p className="text-lg text-muted">
          {circle.principalName}&apos;s circle (version {circle.version}). Propose changes; the current circle must
          agree.
        </p>
        <p className="text-base text-muted">
          Now: {circle.policy.threshold} of {circle.policy.memberCount} must agree · everyday limit{" "}
          {money(circle.policy.dollarLimitCents)}
        </p>
        {circle.tamperDetected && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-base text-amber-900">
            Stored rules look tampered. Changes stay locked until verification is restored.
            {circle.tamperReason ? ` ${circle.tamperReason}` : ""}
          </p>
        )}
      </header>

      {error && <p className="rounded-md bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">People</legend>
        {people.length === 0 ? (
          <p className="text-lg text-muted">
            No candidates yet. Ask circle members to sign in once so they appear here.
          </p>
        ) : (
          people.map((p) => {
            const row = selected[p.id] ?? { on: false, relationship: "", displayName: p.displayName };
            return (
              <label
                key={p.id}
                className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3"
              >
                <span className="flex items-center gap-3 text-lg">
                  <input
                    type="checkbox"
                    className="size-5 accent-accent"
                    checked={row.on}
                    onChange={(e) =>
                      setSelected((s) => ({
                        ...s,
                        [p.id]: { ...row, on: e.target.checked, displayName: p.displayName },
                      }))
                    }
                  />
                  <span>
                    {p.displayName}
                    {p.username ? <span className="text-muted"> · {p.username}</span> : null}
                  </span>
                </span>
                {row.on && (
                  <input
                    type="text"
                    placeholder="Relationship (optional)"
                    className="h-14 rounded-md border border-line px-4 text-lg"
                    value={row.relationship}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [p.id]: { ...row, relationship: e.target.value } }))
                    }
                  />
                )}
              </label>
            );
          })
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">How many must agree</legend>
        <select
          className="h-14 rounded-md border border-line bg-surface px-4 text-lg"
          value={cappedThreshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        >
          {Array.from({ length: Math.max(members.length, MIN_THRESHOLD) }, (_, i) => i + 1)
            .filter((n) => n >= MIN_THRESHOLD && n <= Math.max(members.length, MIN_THRESHOLD))
            .map((n) => (
              <option key={n} value={n}>
                {n} of {Math.max(members.length, n)}
              </option>
            ))}
        </select>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">Everyday limit</legend>
        <p className="text-base text-muted">Amounts above this are held for the circle.</p>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">$</span>
          <input
            type="text"
            inputMode="decimal"
            className="h-14 w-full rounded-md border border-line bg-surface pl-8 pr-4 text-lg"
            value={limitDollars}
            onChange={(e) => setLimitDollars(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">Always held types</legend>
        {ALL_TYPES.map((t) => {
          const on = protectedTypes.includes(t);
          return (
            <label key={t} className="flex items-center gap-3 text-lg">
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={on}
                onChange={(e) =>
                  setProtectedTypes((prev) => (e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)))
                }
              />
              {REQUEST_TYPE_LABELS[t]}
            </label>
          );
        })}
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-xl font-semibold">Why this change</span>
        <p className="text-base text-muted">Optional. The circle will see this on the request.</p>
        <textarea
          className="min-h-28 rounded-md border border-line bg-surface px-4 py-3 text-lg"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={saving || members.length < MIN_THRESHOLD || circle.tamperDetected}
        className="h-14 rounded-md bg-accent text-lg font-medium text-surface disabled:opacity-40"
      >
        {saving ? "Submitting…" : "Propose change"}
      </button>
    </form>
  );
}
