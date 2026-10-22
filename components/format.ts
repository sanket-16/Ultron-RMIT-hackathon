import type { ApiError, RequestStatus, RequestType } from "@/lib/contracts";

export function money(cents?: number): string {
  if (cents == null) return "";
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  large_withdrawal: "Large withdrawal",
  sell_home: "Sell home",
  change_will: "Change will",
  care_home_move: "Care home move",
  other: "Other",
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  held: "Waiting",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  executed: "Done",
};

export async function readApi<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; error: string; details?: unknown }> {
  const body = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    const err = body as ApiError;
    return { ok: false, error: err.error || `Something went wrong (${res.status})`, details: err.details };
  }
  return { ok: true, data: body };
}

export function errorText(error: string, details?: unknown): string {
  if (details == null) return error;
  if (typeof details === "string") return `${error}: ${details}`;
  if (typeof details === "object" && details !== null && "code" in details) {
    return `${error} (${String((details as { code: unknown }).code)})`;
  }
  return error;
}
