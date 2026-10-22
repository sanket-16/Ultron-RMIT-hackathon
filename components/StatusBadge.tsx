import type { RequestStatus } from "@/lib/contracts";
import { STATUS_LABELS } from "@/components/format";

const TONE: Record<RequestStatus, string> = {
  held: "bg-[#f5e6c8] text-[#5c4a1f] ring-[#d4c4a0]",
  approved: "bg-accent-soft text-accent ring-accent/30",
  declined: "bg-[#f3e0e0] text-[#6b2e2e] ring-[#e0c4c4]",
  cancelled: "bg-surface text-muted ring-line",
  executed: "bg-accent-soft text-accent ring-accent/30",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ring-1 ring-inset ${TONE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
