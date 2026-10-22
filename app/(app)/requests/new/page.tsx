"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RequestType, RequestView } from "@/lib/contracts";
import { RequestType as RequestTypeEnum } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { errorText, readApi, REQUEST_TYPE_LABELS } from "@/components/format";

const TYPES = RequestTypeEnum.options;

export default function NewRequestPage() {
  const { authFetch } = useGuardianAuth();
  const router = useRouter();
  const [type, setType] = useState<RequestType>("large_withdrawal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give this request a short title.");
      return;
    }
    let amountCents: number | undefined;
    if (amount.trim()) {
      const dollars = Number(amount.replace(/,/g, ""));
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError("Enter a valid amount, or leave it blank.");
        return;
      }
      amountCents = Math.round(dollars * 100);
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          type,
          title: trimmed,
          description: description.trim() || undefined,
          amountCents,
          payee: payee.trim() || undefined,
        }),
      });
      const parsed = await readApi<{ request: RequestView }>(res);
      if (!parsed.ok) {
        setError(errorText(parsed.error, parsed.details));
        return;
      }
      router.replace(`/requests/${parsed.data.request.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">New request</h1>
        <p className="text-lg text-muted">Ask clearly. The circle will see what you write here.</p>
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">{error}</p>}

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-foreground">Type</span>
        <select
          className="h-14 rounded-xl border border-line bg-surface px-4 text-lg"
          value={type}
          onChange={(e) => setType(e.target.value as RequestType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-foreground">Title</span>
        <input
          className="h-14 rounded-xl border border-line bg-surface px-4 text-lg"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Care home invoice"
          required
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-foreground">Details (optional)</span>
        <textarea
          className="min-h-28 rounded-xl border border-line bg-surface px-4 py-3 text-lg"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-foreground">Amount (optional)</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">$</span>
          <input
            type="text"
            inputMode="decimal"
            className="h-14 w-full rounded-xl border border-line bg-surface pl-8 pr-4 text-lg"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="12000"
          />
        </div>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-foreground">Payee (optional)</span>
        <input
          className="h-14 rounded-xl border border-line bg-surface px-4 text-lg"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          maxLength={120}
          placeholder="Rosewood Care"
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="h-14 rounded-xl bg-accent text-lg font-medium text-surface disabled:opacity-50"
      >
        {saving ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
