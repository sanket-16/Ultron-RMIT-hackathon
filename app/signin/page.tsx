"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuardianAuth } from "@/lib/tidecloak/client";

type DevUser = { username: string; name: string; relationship?: string; roles: string[] };

export default function SignInPage() {
  const { mode, ready, authenticated, login } = useGuardianAuth();
  const router = useRouter();
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);

  useEffect(() => {
    if (mode === "dev") fetch("/api/dev/login").then((r) => r.json()).then((b) => setDevUsers(b.users ?? []));
  }, [mode]);

  useEffect(() => {
    if (ready && authenticated) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") ? next : "/home");
    }
  }, [ready, authenticated, router]);

  return (
    <main className="mx-auto w-full max-w-md p-6 flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Guardian Circle</h1>
      {!ready && <p className="text-lg">Checking your sign-in…</p>}
      {ready && mode === "tide" && (
        <button className="h-14 rounded-xl bg-teal-700 text-white text-lg" onClick={() => login()}>
          Sign in with TideCloak
        </button>
      )}
      {ready && mode === "dev" && (
        <>
          <p className="text-zinc-600">Dev mode: pick who you are.</p>
          {devUsers.map((u) => (
            <button
              key={u.username}
              className="h-14 rounded-xl border border-zinc-300 text-lg text-left px-4"
              onClick={() => login(u.username)}
            >
              {u.name} {u.relationship ? <span className="text-zinc-500">({u.relationship})</span> : null}
            </button>
          ))}
        </>
      )}
    </main>
  );
}
