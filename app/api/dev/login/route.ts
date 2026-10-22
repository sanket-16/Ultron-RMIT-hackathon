/** DEV MODE ONLY: one-click sign-in as a demo character. 404 in tide mode. */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authMode, TOKEN_COOKIE } from "@/lib/tidecloak/config";
import { DEV_USERS, mintDevToken } from "@/lib/tidecloak/dev";
import { errorResponse, parseBody } from "@/lib/authority/http";
import { HttpError } from "@/lib/tidecloak/verify";

const Input = z.object({ username: z.string() });

export async function GET() {
  if (authMode !== "dev") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ users: DEV_USERS });
}

export async function POST(req: NextRequest) {
  try {
    if (authMode !== "dev") throw new HttpError(404, "Not found");
    const { username } = await parseBody(req, Input);
    const user = DEV_USERS.find((u) => u.username === username);
    if (!user) throw new HttpError(404, "Unknown demo user.");
    const token = await mintDevToken(user);
    const res = NextResponse.json({ token, user });
    res.cookies.set(TOKEN_COOKIE, token, { path: "/", sameSite: "lax", httpOnly: false });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(TOKEN_COOKIE);
  return res;
}
