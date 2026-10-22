"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RequestView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, money, readApi } from "@/components/format";

type TamperMode = "votes" | "policy" | "undo";
type ControlBusy = TamperMode | "reset" | "seed";

type VotesResult = {
  tampered: "votes";
  released: boolean;
  fundsMoved: boolean;
  message: string;
  rejectedVotes: { memberId: string; reason: string }[];
  request: RequestView;
};

type PolicyResult = {
  tampered: "policy";
  effectiveThreshold?: number;
  tamperDetected?: boolean;
  tamperReason?: string;
};

type UndoResult = { undone: true };

type DemoResult =
  | { kind: "votes"; status: number; data: VotesResult }
  | { kind: "policy"; status: number; data: PolicyResult }
  | { kind: "undo"; status: number; data: UndoResult };

type SeedResult = {
  nextSteps?: string[];
  requests?: {
    eightyK?: { id?: string; title?: string };
    careHome?: { id?: string; title?: string };
  };
};

export default function DemoPage() {
  const { user, authFetch } = useGuardianAuth();
  const isPrincipal = !!user?.roles.includes("principal");
  const [held, setHeld] = useState<RequestView[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ControlBusy | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disabledNote, setDisabledNote] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [resetNote, setResetNote] = useState<string | null>(null);

  const loadHeld = useCallback(async () => {
    const res = await authFetch("/api/requests");
    const parsed = await readApi<{ requests: RequestView[] }>(res);
    if (!parsed.ok) {
      return { held: [] as RequestView[], error: errorText(parsed.error, parsed.details) };
    }
    const next = (parsed.data.requests ?? []).filter((r) => r.status === "held");
    return { held: next, error: null as string | null };
  }, [authFetch]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    loadHeld().then((d) => {
      if (!alive) return;
      setHeld(d.held);
      setLoadError(d.error);
      setSelectedId((prev) => {
        if (prev && d.held.some((r) => r.id === prev)) return prev;
        return d.held[0]?.id ?? "";
      });
    });
    return () => {
      alive = false;
    };
  }, [user, loadHeld]);

  async function resetDemo() {
    if (
      !window.confirm(
        "Reset all demo data? Circles, requests, and votes will be cleared.",
      )
    ) {
      return;
    }
    setBusy("reset");
    setActionError(null);
    setResetNote(null);
    setSeedResult(null);
    try {
      const res = await authFetch("/api/demo/reset", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: unknown;
        message?: string;
      };
      if (!res.ok) {
        setActionError(errorText(body.error || `Reset failed (${res.status})`, body.details));
        return;
      }
      setResetNote(body.message || "Demo data cleared. Seed again as Margaret when ready.");
      const refreshed = await loadHeld();
      setHeld(refreshed.held);
      setLoadError(refreshed.error);
      setSelectedId("");
      setResult(null);
    } finally {
      setBusy(null);
    }
  }

  async function seedStory() {
    setBusy("seed");
    setActionError(null);
    setResetNote(null);
    setSeedResult(null);
    try {
      const res = await authFetch("/api/demo/seed", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as SeedResult & {
        error?: string;
        details?: unknown;
      };
      if (!res.ok) {
        setActionError(errorText(body.error || `Seed failed (${res.status})`, body.details));
        return;
      }
      setSeedResult(body);
      const refreshed = await loadHeld();
      setHeld(refreshed.held);
      setLoadError(refreshed.error);
      setSelectedId((prev) => {
        if (prev && refreshed.held.some((r) => r.id === prev)) return prev;
        return refreshed.held[0]?.id ?? "";
      });
    } finally {
      setBusy(null);
    }
  }

  async function run(mode: TamperMode) {
    setBusy(mode);
    setActionError(null);
    setDisabledNote(null);
    setResult(null);
    try {
      let requestId: string | undefined;
      if (mode === "votes") {
        requestId = selectedId || held[0]?.id;
        if (!requestId) {
          setActionError("No held request to tamper. Create one first, then come back.");
          return;
        }
      }

      const res = await authFetch("/api/demo/tamper", {
        method: "POST",
        body: JSON.stringify(mode === "votes" ? { mode, requestId } : { mode }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
        details?: unknown;
      };

      // Votes mode returns 403 when release is refused — that is the demo working.
      if (mode === "votes" && body.tampered === "votes" && "rejectedVotes" in body) {
        setResult({ kind: "votes", status: res.status, data: body as unknown as VotesResult });
        const refreshed = await loadHeld();
        setHeld(refreshed.held);
        setLoadError(refreshed.error);
        return;
      }

      if (res.status === 404 && typeof body.error === "string" && /tamper demo is turned off/i.test(body.error)) {
        setDisabledNote(
          "Tamper demo is turned off on this server. Set GUARDIAN_ENABLE_TAMPER_DEMO=1 and restart.",
        );
        return;
      }

      if (!res.ok) {
        setActionError(errorText(body.error || `Something went wrong (${res.status})`, body.details));
        return;
      }

      if (mode === "votes") {
        setResult({ kind: "votes", status: res.status, data: body as unknown as VotesResult });
      } else if (mode === "policy") {
        setResult({ kind: "policy", status: res.status, data: body as unknown as PolicyResult });
      } else {
        setResult({ kind: "undo", status: res.status, data: body as unknown as UndoResult });
      }

      const refreshed = await loadHeld();
      setHeld(refreshed.held);
      setLoadError(refreshed.error);
      if (mode === "votes" && requestId) setSelectedId(requestId);
    } finally {
      setBusy(null);
    }
  }

  const eightyKId = seedResult?.requests?.eightyK?.id;
  const careHomeId = seedResult?.requests?.careHome?.id;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-md border border-line bg-accent-soft/40 px-4 py-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Judge walkthrough</h1>
          <p className="text-lg text-muted">
            Reset the store, then seed Margaret’s circle with the $80k investment (held) and care-home
            invoice (held). Sign in as Margaret to seed.
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy !== null}
            className="h-14 rounded-md border border-line bg-surface px-4 text-lg text-foreground disabled:opacity-50"
            onClick={() => void resetDemo()}
          >
            {busy === "reset" ? "Resetting…" : "Reset demo data"}
          </button>
          <button
            type="button"
            disabled={busy !== null || !isPrincipal}
            title={!isPrincipal ? "Sign in as Margaret (principal) to seed" : undefined}
            className="h-14 rounded-md bg-accent px-4 text-lg font-medium text-surface disabled:opacity-40"
            onClick={() => void seedStory()}
          >
            {busy === "seed" ? "Seeding…" : "Seed story (circle + $80k + care home)"}
          </button>
        </div>

        {!isPrincipal && (
          <p className="text-base text-muted">
            Seed is only available when signed in as Margaret (principal).
          </p>
        )}

        {resetNote && <p className="text-base text-foreground">{resetNote}</p>}

        {seedResult && (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-4">
            <p className="text-xl font-medium text-foreground">Story ready.</p>
            {seedResult.nextSteps && seedResult.nextSteps.length > 0 && (
              <ol className="list-decimal space-y-2 pl-5 text-base text-muted">
                {seedResult.nextSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
            <div className="flex flex-col gap-2 text-lg">
              <Link href="/home" className="text-accent underline">
                Open home
              </Link>
              {eightyKId && (
                <Link href={`/requests/${eightyKId}`} className="text-accent underline">
                  Invest for Mum ({eightyKId})
                </Link>
              )}
              {careHomeId && (
                <Link href={`/requests/${careHomeId}`} className="text-accent underline">
                  Care home invoice ({careHomeId})
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Database tamper demo</h2>
          <p className="text-xl text-foreground">Corrupt the database — funds still stay held.</p>
          <p className="text-lg text-muted">
            Pretend you are a rogue admin. Edit stored votes or policy rows. Guardian still refuses to
            release money without Tide-signed approvals.
          </p>
        </header>

        {loadError && <p className="rounded-md bg-rose-50 px-4 py-3 text-base text-rose-800">{loadError}</p>}
        {disabledNote && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-base text-amber-950">{disabledNote}</p>
        )}
        {actionError && <p className="rounded-md bg-rose-50 px-4 py-3 text-base text-rose-800">{actionError}</p>}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-base text-foreground">
            Held request for vote tamper
            <select
              className="h-14 rounded-md border border-line bg-surface px-3 text-lg"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={held.length === 0 || busy !== null}
            >
              {held.length === 0 ? (
                <option value="">No held requests</option>
              ) : (
                held.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                    {r.amountCents != null ? ` · ${money(r.amountCents)}` : ""} · {r.authority.reason}
                  </option>
                ))
              )}
            </select>
          </label>
          {held.length === 0 && (
            <p className="text-base text-muted">
              Need a held request first.{" "}
              <Link href="/requests/new" className="text-accent underline">
                Create one
              </Link>
              .
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy !== null || !selectedId}
            className="h-14 rounded-md border border-rose-300 bg-rose-50 text-lg text-rose-950 disabled:opacity-50"
            onClick={() => run("votes")}
          >
            {busy === "votes" ? "Corrupting votes…" : "Mark approved + insert fake votes"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="h-14 rounded-md border border-rose-300 bg-rose-50 text-lg text-rose-950 disabled:opacity-50"
            onClick={() => run("policy")}
          >
            {busy === "policy" ? "Corrupting policy…" : "Lower threshold to 1 in the database"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="h-14 rounded-md border border-line bg-surface text-lg text-foreground disabled:opacity-50"
            onClick={() => run("undo")}
          >
            {busy === "undo" ? "Undoing…" : "Undo tampering"}
          </button>
        </div>

        {result?.kind === "votes" && (
          <div className="flex flex-col gap-3 rounded-md bg-accent-soft/60 px-4 py-4">
            <p className="text-xl font-medium text-foreground">
              {result.data.fundsMoved
                ? "Unexpected: funds moved."
                : "Funds stayed held. Fake votes were ignored."}
            </p>
            <p className="text-lg text-foreground">{result.data.message}</p>
            <p className="text-base text-muted">
              Stored status may look “approved”; authority still says no. HTTP {result.status}.
            </p>
            {result.data.rejectedVotes.length > 0 && (
              <ul className="rounded-md bg-rose-50 px-4 py-3 text-base text-rose-800">
                {result.data.rejectedVotes.map((v, i) => (
                  <li key={i}>
                    Ignored vote ({v.memberId}): {v.reason}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/requests/${result.data.request.id}`} className="text-lg text-accent underline">
              Open request detail
            </Link>
          </div>
        )}

        {result?.kind === "policy" && (
          <div className="flex flex-col gap-3 rounded-md bg-accent-soft/60 px-4 py-4">
            <p className="text-xl font-medium text-foreground">
              {result.data.tamperDetected
                ? "Tampered policy detected and ignored."
                : "Policy write attempted."}
            </p>
            {result.data.tamperReason && (
              <p className="text-lg text-foreground">{result.data.tamperReason}</p>
            )}
            {result.data.effectiveThreshold != null && (
              <p className="text-base text-muted">
                Effective threshold still {result.data.effectiveThreshold}.
              </p>
            )}
            <Link href="/home" className="text-lg text-accent underline">
              Back to home
            </Link>
          </div>
        )}

        {result?.kind === "undo" && (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-4">
            <p className="text-xl font-medium text-foreground">Tampering undone.</p>
            <p className="text-base text-muted">Forged rows removed; stored statuses restored.</p>
          </div>
        )}
      </div>
    </section>
  );
}
