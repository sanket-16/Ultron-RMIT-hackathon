import { json, withAuth } from "@/lib/authority/http";
import { cancelRequest } from "@/lib/authority/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>([], async (_req, me, { params }) => {
  const { id } = await params;
  return json({ request: await cancelRequest(me, id) });
});
