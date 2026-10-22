/**
 * Route protection for pages (Next.js 16 "proxy", formerly middleware).
 * API routes verify the token themselves in every handler (lib/authority/http.ts),
 * so this is a convenience redirect, not the security boundary.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/tidecloak/verify";

/** Person B: add page prefixes here as you build them (e.g. "/home", "/setup"). */
const PROTECTED_PAGES = ["/protected", "/home", "/setup", "/requests", "/audit"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!PROTECTED_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return NextResponse.next();
  const me = await getIdentity(req);
  if (me) return NextResponse.next();
  const url = new URL("/signin", req.url);
  url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

// Keep in sync with PROTECTED_PAGES.
export const config = {
  matcher: [
    "/protected",
    "/protected/:path*",
    "/home",
    "/home/:path*",
    "/setup",
    "/setup/:path*",
    "/requests",
    "/requests/:path*",
    "/audit",
    "/audit/:path*",
  ],
};
