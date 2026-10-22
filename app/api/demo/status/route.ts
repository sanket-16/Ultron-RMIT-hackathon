import { json, withAuth } from "@/lib/authority/http";
import { demoStatus } from "@/lib/authority/demo-seed";

/** Demo tooling status for the signed-in user (auth mode, tamper flag, circle). */
export const GET = withAuth([], async (_req, me) => json(await demoStatus(me)));
