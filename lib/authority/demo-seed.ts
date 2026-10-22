/**
 * DEMO ONLY — reset + seed Margaret's circle and the two story requests.
 * Uses mintDevToken so judges can run the walkthrough without clicking every setup step.
 */
import { authMode } from "@/lib/tidecloak/config";
import { DEV_USERS, mintDevToken } from "@/lib/tidecloak/dev";
import type { Identity } from "@/lib/tidecloak/verify";
import { HttpError } from "@/lib/tidecloak/verify";
import { getAuthorityStore } from "./store";
import { createRequest, getMyCircle, setupCircle, toCircleView } from "./service";
import { findCircleForUser } from "./engine";

const DEMO_RULES = {
  members: [
    { memberId: "dev-sarah", displayName: "Sarah", relationship: "daughter" },
    { memberId: "dev-james", displayName: "James", relationship: "son" },
    { memberId: "dev-helen", displayName: "Helen", relationship: "family friend" },
  ],
  threshold: 2,
  dollarLimitCents: 500_000, // $5,000
  protectedTypes: ["large_withdrawal", "sell_home", "change_will", "care_home_move"] as const,
};

async function identityFromDevUsername(username: string): Promise<Identity> {
  const user = DEV_USERS.find((u) => u.username === username);
  if (!user) throw new HttpError(500, `Unknown demo user ${username}`);
  const token = await mintDevToken(user);
  // Match verify.ts Identity shape used by authority service.
  return {
    id: user.id,
    username: user.username,
    displayName: user.name,
    roles: user.roles,
    token,
    issuedAt: Math.floor(Date.now() / 1000),
    vuid: user.id,
  };
}

export async function resetDemoStore(): Promise<void> {
  if (authMode !== "dev") throw new HttpError(404, "Demo reset is only available in dev mode.");
  if (process.env.GUARDIAN_ENABLE_TAMPER_DEMO !== "1") {
    throw new HttpError(404, "Demo tools are turned off. Set GUARDIAN_ENABLE_TAMPER_DEMO=1.");
  }
  await getAuthorityStore().clearAll();
}

/** Wipe store, register cast, set up circle, create $80k (held) + care-home (held). */
export async function seedDemoStory(margaret: Identity) {
  if (authMode !== "dev") throw new HttpError(404, "Demo seed is only available in dev mode.");
  if (process.env.GUARDIAN_ENABLE_TAMPER_DEMO !== "1") {
    throw new HttpError(404, "Demo tools are turned off. Set GUARDIAN_ENABLE_TAMPER_DEMO=1.");
  }
  if (!margaret.roles.includes("principal")) {
    throw new HttpError(403, "Sign in as Margaret to seed the demo.");
  }

  await getAuthorityStore().clearAll();

  const now = new Date().toISOString();
  for (const u of DEV_USERS) {
    await getAuthorityStore().upsertUser({
      id: u.id,
      username: u.username,
      displayName: u.name,
      roles: u.roles,
      lastSeenAt: now,
    });
  }

  // Fresh Margaret token for genesis evidence.
  const principal = await identityFromDevUsername("margaret");
  const circle = await setupCircle(principal, {
    members: [...DEMO_RULES.members],
    threshold: DEMO_RULES.threshold,
    dollarLimitCents: DEMO_RULES.dollarLimitCents,
    protectedTypes: [...DEMO_RULES.protectedTypes],
  });

  const james = await identityFromDevUsername("james");
  const big = await createRequest(james, {
    type: "large_withdrawal",
    title: "Invest for Mum",
    description: "James wants to move $80,000 into an investment account.",
    amountCents: 8_000_000,
    payee: "J. Investments",
  });

  const care = await createRequest(principal, {
    type: "care_home_move",
    title: "Care home invoice",
    description: "Rosewood Care — monthly invoice Margaret asked the circle to approve.",
    amountCents: 1_200_000,
    payee: "Rosewood Care",
  });

  return {
    circle,
    requests: { eightyK: big, careHome: care },
    nextSteps: [
      "Sign in as Sarah or Helen → Home → decline “Invest for Mum” (or open Demo and tamper first).",
      "Sign in as Sarah + Helen → approve “Care home invoice” → it completes.",
      "Use Demo → tamper to show a DB edit cannot release funds.",
    ],
  };
}

export async function demoStatus(me: Identity) {
  const circle = await getMyCircle(me);
  const verified = await findCircleForUser(me.id);
  return {
    authMode,
    tamperEnabled: process.env.GUARDIAN_ENABLE_TAMPER_DEMO === "1",
    circle: circle ?? (verified ? toCircleView(verified) : null),
  };
}
