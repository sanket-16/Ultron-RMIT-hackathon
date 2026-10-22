"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { CircleView } from "@/lib/contracts";
import { useGuardianAuth } from "@/lib/tidecloak/client";
import { readApi } from "@/components/format";

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout, authFetch } = useGuardianAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPrincipal = !!user?.roles.includes("principal");
  const canRequest =
    !!user &&
    (user.roles.includes("principal") ||
      user.roles.includes("circle_member") ||
      user.roles.includes("requester"));

  const [circle, setCircle] = useState<CircleView | null | undefined>(undefined);

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace(`/signin?next=${encodeURIComponent(pathname || "/home")}`);
    }
  }, [ready, authenticated, pathname, router]);

  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    let alive = true;
    (async () => {
      const res = await authFetch("/api/circle");
      const parsed = await readApi<{ circle: CircleView | null }>(res);
      if (!alive) return;
      setCircle(parsed.ok ? parsed.data.circle : null);
    })();
    return () => {
      alive = false;
    };
  }, [ready, authenticated, user, authFetch, pathname]);

  if (!ready || !authenticated || !user) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-10">
        <p className="text-lg text-zinc-600">Checking your sign-in…</p>
      </main>
    );
  }

  const showNewRequest = canRequest && circle != null;
  const navItems: { href: string; label: string }[] = [
    { href: "/home", label: "Home" },
    ...(showNewRequest ? [{ href: "/requests/new", label: "New request" }] : []),
    { href: "/audit", label: "Audit" },
    ...(isPrincipal ? [{ href: "/setup", label: "Setup" }] : []),
  ];

  return (
    <div className="min-h-full bg-gradient-to-b from-teal-50/80 via-stone-50 to-stone-100 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-teal-100/70 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-teal-800">Guardian Circle</p>
            <p className="truncate text-base text-zinc-700">{user.displayName}</p>
          </div>
          <button
            type="button"
            className="h-14 shrink-0 rounded-xl border border-zinc-300 bg-white px-4 text-lg text-zinc-800"
            onClick={() => logout()}
          >
            Sign out
          </button>
        </div>
        <nav
          className="mx-auto flex w-full max-w-lg gap-2 overflow-x-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Main"
        >
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-14 shrink-0 items-center rounded-xl px-4 text-lg ${
                  active ? "bg-teal-700 text-white" : "bg-white/70 text-zinc-800 ring-1 ring-zinc-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-6">{children}</main>
    </div>
  );
}
