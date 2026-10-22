/**
 * Side-effect: swap in DrizzleAuthorityStore when DATABASE_URL is set.
 * Safe to import from Next server entry points; no-op without credentials.
 */
import { setAuthorityStore } from "@/lib/authority/store";
import { hasDatabaseUrl } from "./index";
import { DrizzleAuthorityStore } from "./drizzle-store";

if (hasDatabaseUrl()) {
  setAuthorityStore(new DrizzleAuthorityStore());
}
