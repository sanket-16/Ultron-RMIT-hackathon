"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AuditEventView, CircleView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, formatWhen, readApi } from "@/components/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { LoadingBlock } from "@/components/ui/LoadingBlock";

export default function AuditPage() {
  const { user, authFetch } = useGuardianAuth();
  const [circle, setCircle] = useState<CircleView | null | undefined>(undefined);
  const [events, setEvents] = useState<AuditEventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    const [cRes, aRes] = await Promise.all([authFetch("/api/circle"), authFetch("/api/audit")]);
    const c = await readApi<{ circle: CircleView | null }>(cRes);
    if (!c.ok) {
      return {
        circle: null as CircleView | null,
        events: [] as AuditEventView[],
        error: errorText(c.error, c.details),
      };
    }
    if (!c.data.circle) {
      return { circle: null as CircleView | null, events: [] as AuditEventView[], error: null as string | null };
    }
    const parsed = await readApi<{ events: AuditEventView[] }>(aRes);
    if (!parsed.ok) {
      return {
        circle: c.data.circle,
        events: [] as AuditEventView[],
        error: errorText(parsed.error, parsed.details),
      };
    }
    return { circle: c.data.circle, events: parsed.data.events ?? [], error: null as string | null };
  }, [authFetch]);

  const reload = useCallback(() => {
    setEvents(null);
    setCircle(undefined);
    setError(null);
    fetchAudit().then((d) => {
      setCircle(d.circle);
      setEvents(d.events);
      setError(d.error);
    });
  }, [fetchAudit]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchAudit().then((d) => {
      if (!alive) return;
      setCircle(d.circle);
      setEvents(d.events);
      setError(d.error);
    });
    return () => {
      alive = false;
    };
  }, [user, fetchAudit]);

  if (circle === undefined || events === null) {
    return <LoadingBlock label="Loading activity…" />;
  }

  const isPrincipal = !!user?.roles.includes("principal");

  if (!circle) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Audit</h1>
        {error && <ErrorBanner message={error} onRetry={reload} />}
        {isPrincipal ? (
          <EmptyState
            title="No circle yet"
            body="Set up your circle first. Then you will see who asked and who agreed."
            actionHref="/setup"
            actionLabel="Set up your circle"
          />
        ) : (
          <EmptyState
            title="Waiting for Margaret…"
            body="Once Margaret sets up the circle, activity will show here."
          />
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Audit</h1>
        <p className="text-lg text-zinc-700">Who asked, who agreed, and what happened.</p>
      </header>

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {events.length === 0 ? (
        <EmptyState title="Nothing here yet" body="When people ask or vote, it will be listed here." />
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((e) => (
            <li key={e.id} className="border-b border-teal-100/80 pb-4 last:border-0">
              <p className="text-sm text-zinc-500">{formatWhen(e.at)}</p>
              <p className="mt-1 text-lg text-zinc-900">{e.message}</p>
              <p className="mt-1 text-base text-zinc-600">{e.actorName}</p>
              {e.requestId && (
                <Link
                  href={`/requests/${e.requestId}`}
                  className="mt-2 inline-flex h-14 items-center text-lg text-teal-800 underline"
                >
                  View request
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
