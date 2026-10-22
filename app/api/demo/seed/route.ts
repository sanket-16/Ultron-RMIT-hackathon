import { json, withAuth } from "@/lib/authority/http";
import { seedDemoStory } from "@/lib/authority/demo-seed";

/** Wipe store and seed Margaret's circle plus the two story requests. Principal only. */
export const POST = withAuth(["principal"], async (_req, me) => {
  return json(await seedDemoStory(me));
});
