"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CircleView, RequestType, UserSummary } from "@/lib/contracts";
import { MIN_THRESHOLD, RequestType as RequestTypeEnum } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, money, readApi, REQUEST_TYPE_LABELS } from "@/components/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

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

  const reload = useCallback(() => {
    setCircle(undefined);
    setError(null);
    fetchSetup().then((d) => {
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
  }, [fetchSetup]);

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
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Circle setup</h1>
        <EmptyState
          title="Only Margaret can set this up"
          body="Ask the account holder to choose the circle. You can come back here once they invite you."
          actionHref="/home"
          actionLabel="Back to home"
        />
      </section>
    );
  }

  if (circle === undefined) {
    return <LoadingBlock label="Loading setup…" />;
  }

  if (circle) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Circle already set</h1>
        <p className="text-lg text-zinc-700">
          {circle.principalName}&apos;s circle is active. To change people or rules, send a circle change request
          for the group to approve.
        </p>
        <p className="text-base text-zinc-600">
          {circle.policy.threshold} of {circle.policy.memberCount} must agree · everyday limit{" "}
          {money(circle.policy.dollarLimitCents)}
        </p>
        <ul className="flex flex-col gap-2 text-lg text-zinc-800">
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
        <p className="text-lg text-zinc-700">Choose who you trust. Big decisions wait until enough of them agree.</p>
      </header>

      {error && <ErrorBanner message={error} onRetry={reload} />}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">People</legend>
        {candidates.length === 0 ? (
          <EmptyState
            title="No one to pick yet"
            body="Ask your trusted people to sign in once. Then they will show up here."
          />
        ) : (
          candidates.map((c) => {
            const row = selected[c.id] ?? { on: false, relationship: "" };
            return (
              <label
                key={c.id}
                className="flex flex-col gap-2 rounded-2xl border border-teal-100 bg-white/80 px-4 py-3"
              >
                <span className="flex min-h-14 items-center gap-3 text-lg">
                  <input
                    type="checkbox"
                    className="size-6 accent-teal-700"
                    checked={row.on}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [c.id]: { ...row, on: e.target.checked } }))
                    }
                  />
                  <span>
                    {c.displayName}
                    <span className="text-zinc-500"> · {c.username}</span>
                  </span>
                </span>
                {row.on && (
                  <input
                    type="text"
                    placeholder="How you know them (optional)"
                    className="h-14 rounded-xl border border-zinc-300 px-4 text-lg"
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
          className="h-14 rounded-xl border border-zinc-300 bg-white px-4 text-lg"
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
        <p className="text-base text-zinc-600">Amounts above this wait for the circle.</p>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-zinc-500">$</span>
          <input
            type="text"
            inputMode="decimal"
            className="h-14 w-full rounded-xl border border-zinc-300 bg-white pl-8 pr-4 text-lg"
            value={limitDollars}
            onChange={(e) => setLimitDollars(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-semibold">Always needs agreement</legend>
        {ALL_TYPES.map((t) => {
          const on = protectedTypes.includes(t);
          return (
            <label key={t} className="flex min-h-14 items-center gap-3 text-lg">
              <input
                type="checkbox"
                className="size-6 accent-teal-700"
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
        className="h-14 rounded-xl bg-teal-700 text-lg font-medium text-white disabled:opacity-40"
      >
        {saving ? "Saving…" : "Create circle"}
      </button>
    </form>
  );
}
