import type { RequestStatus } from "@/lib/contracts";
import { STATUS_LABELS } from "@/components/format";

const TONE: Record<RequestStatus, string> = {
  held: "bg-amber-50 text-amber-900 ring-amber-200",
  approved: "bg-teal-50 text-teal-900 ring-teal-200",
  declined: "bg-rose-50 text-rose-900 ring-rose-200",
  cancelled: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  executed: "bg-teal-50 text-teal-900 ring-teal-200",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
