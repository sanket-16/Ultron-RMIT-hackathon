"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useGuardianAuth } from "@/lib/tidecloak/client";

const NAV = [
  { href: "/home", label: "Home" },
  { href: "/requests/new", label: "New request" },
  { href: "/audit", label: "Audit" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout } = useGuardianAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPrincipal = !!user?.roles.includes("principal");

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace(`/signin?next=${encodeURIComponent(pathname || "/home")}`);
    }
  }, [ready, authenticated, pathname, router]);

  if (!ready || !authenticated || !user) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-10">
        <p className="text-lg text-muted">Checking your sign-in…</p>
      </main>
    );
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-sm font-medium tracking-wide text-accent">
              Guardian Circle
            </p>
            <p className="truncate text-base text-foreground">{user.displayName}</p>
          </div>
          <button
            type="button"
            className="h-14 shrink-0 rounded-md border border-line bg-surface px-4 text-lg text-foreground"
            onClick={() => logout()}
          >
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex w-full max-w-lg gap-1 overflow-x-auto px-3 pb-3" aria-label="Main">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`h-12 shrink-0 rounded-md px-4 text-base leading-[3rem] ${
                  active
                    ? "bg-accent text-surface"
                    : "bg-surface text-foreground ring-1 ring-line"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {isPrincipal && (
            <Link
              href="/setup"
              className={`h-12 shrink-0 rounded-md px-4 text-base leading-[3rem] ${
                pathname.startsWith("/setup")
                  ? "bg-accent text-surface"
                  : "bg-surface text-foreground ring-1 ring-line"
              }`}
            >
              Setup
            </Link>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-6">{children}</main>
    </div>
  );
}
