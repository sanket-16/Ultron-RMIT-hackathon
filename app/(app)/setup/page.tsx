"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CircleView, RequestType, UserSummary } from "@/lib/contracts";
import { MIN_THRESHOLD, RequestType as RequestTypeEnum } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, money, readApi, REQUEST_TYPE_LABELS } from "@/components/format";

const ALL_TYPES = RequestTypeEnum.options;

export default function SetupPage() {
  const { user, authFetch } = useGuardianAuth();
  const router = useRouter();
  const isPrincipal = !!user?.roles.includes("principal");

  const [circle, setCircle] = useState<CircleView | null | undefined>(undefined);
  const [candidates, setCandidates] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Record<string, { on: boolean; relationship: string }>>({});
  const [threshold, setThreshold] = useState(MIN_THRESHOLD);
  const [limitDollars, setLimitDollars] = useState("5000");
  const [protectedTypes, setProtectedTypes] = useState<RequestType[]>(["sell_home", "change_will", "care_home_move"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSetup = useCallback(async () => {
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
    if (!user || !isPrincipal) return;
    let alive = true;
    fetchSetup().then((d) => {
      if (!alive) return;
      setCircle(d.circle);
      setCandidates(d.candidates);
      setError(d.error);
      setSelected((prev) => {
        const next = { ...prev };
        for (const cand of d.candidates) {
          if (!next[cand.id]) next[cand.id] = { on: false, relationship: "" };
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [user, isPrincipal, fetchSetup]);

  const members = useMemo(
    () =>
      candidates
        .filter((c) => selected[c.id]?.on)
        .map((c) => ({
          memberId: c.id,
          displayName: c.displayName,
          relationship: selected[c.id]?.relationship.trim() || undefined,
        })),
    [candidates, selected],
  );

  const cappedThreshold = Math.min(Math.max(threshold, MIN_THRESHOLD), Math.max(members.length, MIN_THRESHOLD));

  if (!isPrincipal) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Circle setup</h1>
        <p className="text-lg text-muted">Only the account holder can set up the circle.</p>
      </section>
    );
  }

  if (circle === undefined) {
    return <p className="text-lg text-muted">Loading…</p>;
  }

  if (circle) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Circle already set</h1>
        <p className="text-lg text-muted">
          {circle.principalName}&apos;s circle is active (version {circle.version}). Changes go through a circle
          proposal, not this screen.
        </p>
        <p className="text-base text-muted">
          {circle.policy.threshold} of {circle.policy.memberCount} must agree · everyday limit{" "}
          {money(circle.policy.dollarLimitCents)}
        </p>
        <ul className="flex flex-col gap-2 text-lg text-foreground">
          {circle.members.map((m) => (
            <li key={m.memberId}>
              {m.displayName}
              {m.relationship ? ` · ${m.relationship}` : ""}
            </li>
          ))}
        </ul>
      </section>
    );
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
      const res = await authFetch("/api/circle", {
        method: "POST",
        body: JSON.stringify({
          members,
          threshold: nextThreshold,
          dollarLimitCents: Math.round(dollars * 100),
          protectedTypes,
        }),
      });
      const parsed = await readApi<{ circle: CircleView }>(res);
      if (!parsed.ok) {
        setError(errorText(parsed.error, parsed.details));
        return;
      }
      router.replace("/home");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Set up your circle</h1>
        <p className="text-lg text-muted">Choose who you trust. Big decisions wait until enough of them agree.</p>
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">People</legend>
        {candidates.length === 0 ? (
          <p className="text-lg text-muted">
            No candidates yet. Ask circle members to sign in once so they appear here.
          </p>
        ) : (
          candidates.map((c) => {
            const row = selected[c.id] ?? { on: false, relationship: "" };
            return (
              <label
                key={c.id}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <span className="flex items-center gap-3 text-lg">
                  <input
                    type="checkbox"
                    className="size-5 accent-accent"
                    checked={row.on}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [c.id]: { ...row, on: e.target.checked } }))
                    }
                  />
                  <span>
                    {c.displayName}
                    <span className="text-muted"> · {c.username}</span>
                  </span>
                </span>
                {row.on && (
                  <input
                    type="text"
                    placeholder="Relationship (optional)"
                    className="h-14 rounded-xl border border-line px-4 text-lg"
                    value={row.relationship}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [c.id]: { ...row, relationship: e.target.value } }))
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
          className="h-14 rounded-xl border border-line bg-surface px-4 text-lg"
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
            className="h-14 w-full rounded-xl border border-line bg-surface pl-8 pr-4 text-lg"
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

      <button
        type="submit"
        disabled={saving || members.length < MIN_THRESHOLD}
        className="h-14 rounded-xl bg-accent text-lg font-medium text-surface disabled:opacity-40"
      >
        {saving ? "Saving…" : "Create circle"}
      </button>
    </form>
  );
}
