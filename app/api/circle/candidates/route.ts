import { json, withAuth } from "@/lib/authority/http";
import { listKnownUsers } from "@/lib/authority/service";

/** People who have signed in at least once and hold the circle_member role in TideCloak. */
export const GET = withAuth(["principal", "circle_member"], async (_req, me) => {
  const users = await listKnownUsers();
  return json({ candidates: users.filter((u) => u.id !== me.id && u.roles.includes("circle_member")) });
});
