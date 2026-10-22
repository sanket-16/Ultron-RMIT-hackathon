import { CreateRequestInput } from "@/lib/contracts";
import { json, parseBody, withAuth } from "@/lib/authority/http";
import { createRequest, listRequests } from "@/lib/authority/service";

export const GET = withAuth([], async (_req, me) => json({ requests: await listRequests(me) }));

/** Create a request. Big or protected ones come back with status "held". */
export const POST = withAuth(["principal", "circle_member", "requester"], async (req, me) => {
  const input = await parseBody(req, CreateRequestInput);
  return json({ request: await createRequest(me, input) }, 201);
});
