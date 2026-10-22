import { json, withAuth } from "@/lib/authority/http";
import { listAudit } from "@/lib/authority/service";

export const GET = withAuth([], async (_req, me) => json({ events: await listAudit(me) }));
