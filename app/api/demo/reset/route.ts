import { json, withAuth } from "@/lib/authority/http";
import { resetDemoStore } from "@/lib/authority/demo-seed";

/** Wipe the authority store so demo / e2e runs start clean. Guard rails live in resetDemoStore. */
export const POST = withAuth([], async () => {
  await resetDemoStore();
  return json({ ok: true });
});
