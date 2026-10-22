"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGuardianAuth } from "@/lib/tidecloak/client";

/** TideCloak sends people back here after signing in. Register it as a redirect URI. */
export default function AuthRedirectPage() {
  const { ready, authenticated } = useGuardianAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(authenticated ? "/protected" : "/");
  }, [ready, authenticated, router]);
  return <p className="p-8 text-lg">Signing you in…</p>;
}
