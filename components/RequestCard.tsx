import Link from "next/link";
import type { RequestView } from "@/lib/contracts";
import { StatusBadge } from "@/components/StatusBadge";
import { formatWhen, money } from "@/components/format";

export function RequestCard({ request }: { request: RequestView }) {
  const amount = money(request.amountCents);

  return (
    <Link
      href={`/requests/${request.id}`}
      className="block w-full rounded-2xl border border-teal-100/80 bg-white/80 px-4 py-4 text-left transition hover:border-teal-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-zinc-900 truncate">{request.title}</p>
          <p className="mt-1 text-base text-zinc-600">
            {request.requesterName}
            {amount ? ` · ${amount}` : ""}
            {request.payee ? ` → ${request.payee}` : ""}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <p className="mt-3 text-base text-teal-800">{request.authority.reason}</p>
      <p className="mt-1 text-sm text-zinc-500">{formatWhen(request.createdAt)}</p>
    </Link>
  );
}
