"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AuditEventView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, formatWhen, readApi } from "@/components/format";

export default function AuditPage() {
  const { user, authFetch } = useGuardianAuth();
  const [events, setEvents] = useState<AuditEventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    const res = await authFetch("/api/audit");
    const parsed = await readApi<{ events: AuditEventView[] }>(res);
    if (!parsed.ok) {
      return { events: [] as AuditEventView[], error: errorText(parsed.error, parsed.details) };
    }
    return { events: parsed.data.events ?? [], error: null as string | null };
  }, [authFetch]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchAudit().then((d) => {
      if (!alive) return;
      setEvents(d.events);
      setError(d.error);
    });
    return () => {
      alive = false;
    };
  }, [user, fetchAudit]);

  if (events === null) {
    return <p className="text-lg text-muted">Loading audit trail…</p>;
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Audit</h1>
        <p className="text-lg text-muted">Who asked, who agreed, and what happened.</p>
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}

      {events.length === 0 ? (
        <p className="text-lg text-muted">No events yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((e) => (
            <li key={e.id} className="border-b border-line pb-4 last:border-0">
              <p className="text-sm text-muted">{formatWhen(e.at)}</p>
              <p className="mt-1 text-lg text-foreground">{e.message}</p>
              <p className="mt-1 text-base text-muted">{e.actorName}</p>
              {e.requestId && (
                <Link href={`/requests/${e.requestId}`} className="mt-2 inline-block text-base text-accent underline">
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
