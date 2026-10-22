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
    <div className="flex flex-col gap-4 rounded-md border border-line bg-surface px-5 py-6">
      <h2 className="font-display text-2xl tracking-tight text-foreground">{title}</h2>
      {body && <p className="text-lg leading-relaxed text-muted">{body}</p>}
      {children}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="flex h-14 items-center justify-center rounded-md bg-accent text-lg font-medium text-surface"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
