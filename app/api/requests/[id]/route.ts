import { json, withAuth } from "@/lib/authority/http";
import { getRequest } from "@/lib/authority/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>([], async (_req, me, { params }) => {
  const { id } = await params;
  return json({ request: await getRequest(me, id) });
});
