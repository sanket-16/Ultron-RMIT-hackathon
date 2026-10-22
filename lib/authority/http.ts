import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import type { Role } from "@/lib/contracts";
import { HttpError, requireIdentity, type Identity } from "@/lib/tidecloak/verify";
import { recordUser } from "./service";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(body);
}

/** Wraps a route: verifies the TideCloak token, records the user, maps errors to JSON. */
export function withAuth<Ctx>(
  roles: Role[],
  handler: (req: NextRequest, me: Identity, ctx: Ctx) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const me = await requireIdentity(req, roles);
      await recordUser(me);
      return await handler(req, me, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  unstable_rethrow(err); // let Next.js handle its own control-flow errors (prerender bailout etc.)
  if (err instanceof HttpError) return json({ error: err.message, details: err.details }, err.status);
  if (err instanceof ZodError) return json({ error: "Some details are missing or invalid.", details: err.issues }, 400);
  console.error("[guardian] unexpected error", err);
  return json({ error: "Something went wrong." }, 500);
}
