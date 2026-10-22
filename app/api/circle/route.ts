import { CircleSetupInput } from "@/lib/contracts";
import { json, parseBody, withAuth } from "@/lib/authority/http";
import { getMyCircle, setupCircle } from "@/lib/authority/service";

/** GET: the verified circle for the signed-in person (or null). */
export const GET = withAuth([], async (_req, me) => json({ circle: await getMyCircle(me) }));

/** POST: first-time setup by the principal. After this, changes go through /api/circle/proposals. */
export const POST = withAuth(["principal"], async (req, me) => {
  const rules = await parseBody(req, CircleSetupInput);
  return json({ circle: await setupCircle(me, rules) }, 201);
});
