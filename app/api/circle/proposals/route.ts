import { CircleChangeInput } from "@/lib/contracts";
import { json, parseBody, withAuth } from "@/lib/authority/http";
import { proposeCircleChange } from "@/lib/authority/service";

/**
 * Propose new members or rules. Creates a held "circle_change" request that the current
 * circle votes on through /api/requests/:id/votes, exactly like a big withdrawal.
 */
export const POST = withAuth(["principal", "circle_member"], async (req, me) => {
  const input = await parseBody(req, CircleChangeInput);
  return json({ request: await proposeCircleChange(me, input) }, 201);
});
