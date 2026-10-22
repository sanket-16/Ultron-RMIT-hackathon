import { VoteInput } from "@/lib/contracts";
import { json, parseBody, withAuth } from "@/lib/authority/http";
import { castVote } from "@/lib/authority/service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Approve or decline. The token on this call becomes the signed evidence for the vote,
 * so the client should refresh it first (see lib/tidecloak/client.tsx -> authFetch).
 */
export const POST = withAuth<Ctx>(["circle_member"], async (req, me, { params }) => {
  const { id } = await params;
  const { decision } = await parseBody(req, VoteInput);
  return json({ request: await castVote(me, id, decision) });
});
