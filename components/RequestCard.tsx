import Link from "next/link";
import type { RequestView } from "@/lib/contracts";
import { StatusBadge } from "@/components/StatusBadge";
import { formatWhen, money } from "@/components/format";

export function RequestCard({ request }: { request: RequestView }) {
  const amount = money(request.amountCents);

  return (
    <Link
      href={`/requests/${request.id}`}
      className="block w-full rounded-md border border-line bg-surface px-4 py-4 text-left transition hover:border-accent/40 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-foreground">{request.title}</p>
          <p className="mt-1 text-base text-muted">
            {request.requesterName}
            {amount ? ` · ${amount}` : ""}
            {request.payee ? ` → ${request.payee}` : ""}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <p className="mt-3 text-base text-accent">{request.authority.reason}</p>
      <p className="mt-1 text-sm text-muted">{formatWhen(request.createdAt)}</p>
    </Link>
  );
}
