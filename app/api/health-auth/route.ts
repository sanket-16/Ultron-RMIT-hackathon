import type { NextRequest } from "next/server";
import { authMode, tideConfigIsPlaceholder } from "@/lib/tidecloak/config";
import { getIdentity } from "@/lib/tidecloak/verify";
import { json } from "@/lib/authority/http";

/** Phase 1 check: is the token valid, and what does TideCloak say about this person? */
export async function GET(req: NextRequest) {
  const me = await getIdentity(req);
  return json(
    {
      authMode,
      tideConfigured: !tideConfigIsPlaceholder,
      authenticated: !!me,
      user: me && { id: me.id, username: me.username, displayName: me.displayName, roles: me.roles, vuid: me.vuid },
    },
    me ? 200 : 401,
  );
}
