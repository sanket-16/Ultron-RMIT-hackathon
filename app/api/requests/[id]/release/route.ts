import { json, withAuth } from "@/lib/authority/http";
import { tryRelease } from "@/lib/authority/service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ask the system to carry out a request. It ignores the stored status and checks the
 * signed approvals from scratch. 403 when authority has not emerged.
 */
export const POST = withAuth<Ctx>([], async (_req, me, { params }) => {
  const { id } = await params;
  const { outcome, request } = await tryRelease(me, id);
  return json({ released: outcome.ok, message: outcome.ok ? "Done." : outcome.message, request }, outcome.ok ? 200 : 403);
});
