import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export function EmptyState({ title, body, actionHref, actionLabel, children }: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-teal-100/80 bg-white/70 px-5 py-6">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h2>
      {body && <p className="text-lg leading-relaxed text-zinc-700">{body}</p>}
      {children}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="flex h-14 items-center justify-center rounded-xl bg-teal-700 text-lg font-medium text-white"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
