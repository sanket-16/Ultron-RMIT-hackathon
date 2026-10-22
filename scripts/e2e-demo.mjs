// End-to-end check of the demo script + attack cases. Needs the dev server in dev auth mode with
// GUARDIAN_ENABLE_TAMPER_DEMO=1 and a fresh (empty) store. Usage: npm run demo:e2e [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(username) {
  const r = await fetch(`${BASE}/api/dev/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }) });
  const b = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(b));
  return { token: b.token, user: b.user };
}
async function api(who, method, path, body) {
  const fresh = await login(who); // fresh token per call (like authFetch {fresh:true})
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${fresh.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
const check = (label, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  -> " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};

// wait for server
for (let i = 0; i < 60; i++) { try { await fetch(`${BASE}/api/health-auth`); break; } catch { await sleep(1000); } }

// Wipe store so Neon-backed (or leftover) runs start clean
{
  const { token } = await login("margaret");
  const r = await fetch(`${BASE}/api/demo/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  });
  if (r.status === 404) {
    console.error(
      "POST /api/demo/reset returned 404. Deploy/run the feat/demo-api server with AUTH_MODE=dev and GUARDIAN_ENABLE_TAMPER_DEMO=1 so e2e can clear the store.",
    );
    process.exit(1);
  }
  const body = await r.json();
  if (!r.ok) throw new Error(`Demo reset failed: ${JSON.stringify(body)}`);
  console.log("Demo store reset.");
}

// everyone signs in once so Margaret can pick them
const users = {};
for (const u of ["margaret", "sarah", "james", "helen", "mallory"]) {
  users[u] = (await login(u)).user;
  await api(u, "GET", "/api/health-auth");
  await api(u, "GET", "/api/circle");
}
const h = await api("margaret", "GET", "/api/health-auth");
check("health-auth verifies token", h.status === 200 && h.body.user.roles.includes("principal"));
check("no token -> 401", (await fetch(`${BASE}/api/requests`)).status === 401);

// 1. Margaret sets circle: 2 of 3, $5,000
const members = [
  { memberId: users.sarah.id, displayName: "Sarah", relationship: "daughter" },
  { memberId: users.james.id, displayName: "James", relationship: "son" },
  { memberId: users.helen.id, displayName: "Helen", relationship: "family friend" },
];
const rules = { members, threshold: 2, dollarLimitCents: 500000, protectedTypes: ["sell_home", "change_will", "care_home_move"] };
check("threshold 1 rejected at setup", (await api("margaret", "POST", "/api/circle", { ...rules, threshold: 1 })).status === 400);
check("non-principal can't set up", (await api("james", "POST", "/api/circle", rules)).status === 403);
const setup = await api("margaret", "POST", "/api/circle", rules);
check("Margaret sets up circle", setup.status === 201, JSON.stringify(setup.body.circle?.policy));
check("second setup refused", (await api("margaret", "POST", "/api/circle", rules)).status === 409);

// small everyday action
const groceries = await api("margaret", "POST", "/api/requests", { type: "other", title: "Groceries", amountCents: 12000, payee: "Grocer" });
check("Margaret's $120 groceries go straight through", groceries.body.request?.status === "executed", groceries.body.request?.payment?.action);

// 2. James asks $80k -> held
const big = await api("james", "POST", "/api/requests", { type: "large_withdrawal", title: "Invest for Mum", amountCents: 8000000, payee: "J. Investments" });
const bigId = big.body.request.id;
check("$80k is held", big.body.request.status === "held", big.body.request.authority.reason);
check("James can't vote on own request", (await api("james", "POST", `/api/requests/${bigId}/votes`, { decision: "approve" })).status === 403);
check("Mallory (outsider) can't see it", (await api("mallory", "GET", `/api/requests/${bigId}`)).status === 404);
check("release before votes -> 403", (await api("james", "POST", `/api/requests/${bigId}/release`)).status === 403);

// 4. DB tamper BEFORE votes: mark approved + fake votes
const t1 = await api("james", "POST", "/api/demo/tamper", { mode: "votes", requestId: bigId });
check("DB 'approved' flag + fake votes do NOT release", t1.status === 403 && t1.body.released === false && !t1.body.fundsMoved, t1.body.rejectedVotes?.map((v) => v.reason).join(" | "));
check("view shows stored=approved but authority=false", t1.body.request.status === "approved" && t1.body.request.authority.established === false);
await api("james", "POST", "/api/demo/tamper", { mode: "undo" });

// 3. Daughter + friend decline -> blocked
const d1 = await api("sarah", "POST", `/api/requests/${bigId}/votes`, { decision: "decline" });
check("Sarah declines -> blocked (can't reach 2)", d1.body.request?.status === "declined", d1.body.request?.authority.reason);
check("Helen can't vote after decision", (await api("helen", "POST", `/api/requests/${bigId}/votes`, { decision: "approve" })).status === 409);
const rel = await api("james", "POST", `/api/requests/${bigId}/release`);
check("release still refused", rel.status === 403 && !rel.body.request.payment);

// policy tamper
const tp = await api("james", "POST", "/api/demo/tamper", { mode: "policy" });
check("DB threshold=1 ignored", tp.body.effectiveThreshold === 2 && tp.body.tamperDetected === true, tp.body.tamperReason);
await api("james", "POST", "/api/demo/tamper", { mode: "undo" });

// 5. Care-home invoice -> Sarah + Helen approve -> completes
const care = await api("margaret", "POST", "/api/requests", { type: "care_home_move", title: "Care home invoice", amountCents: 1200000, payee: "Rosewood Care" });
const careId = care.body.request.id;
check("care home is held (protected type)", care.body.request.status === "held");
const a1 = await api("sarah", "POST", `/api/requests/${careId}/votes`, { decision: "approve" });
check("1 approval: still held", a1.body.request.status === "held" && !a1.body.request.payment);
check("double vote refused", (await api("sarah", "POST", `/api/requests/${careId}/votes`, { decision: "approve" })).status === 409);
const a2 = await api("helen", "POST", `/api/requests/${careId}/votes`, { decision: "approve" });
check("2 approvals: approved + paid (mock)", a2.body.request.status === "approved" && !!a2.body.request.payment, a2.body.request.payment?.action);

// stale token: vote with token minted before the request existed
const stale = await login("helen");
await sleep(6500);
const req3 = await api("margaret", "POST", "/api/requests", { type: "sell_home", title: "Sell the house" });
const sv = await fetch(`${BASE}/api/requests/${req3.body.request.id}/votes`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${stale.token}` }, body: JSON.stringify({ decision: "approve" }) });
check("vote with old token refused (fresh sign-in needed)", sv.status === 401);

// replay attack: DB admin reuses Sarah's + Helen's REAL signed tokens from the care-home vote
const tr = await api("james", "POST", "/api/demo/tamper", { mode: "votes", requestId: req3.body.request.id });
check("replayed real tokens do NOT release", tr.status === 403 && !tr.body.fundsMoved, tr.body.rejectedVotes?.map((v) => v.reason).join(" | "));
await api("james", "POST", "/api/demo/tamper", { mode: "undo" });

// circle change gated by circle: James tries to swap Sarah for Mallory
const change = await api("james", "POST", "/api/circle/proposals", {
  rules: { ...rules, members: [members[1], members[2], { memberId: users.mallory.id, displayName: "Mallory" }] },
  reason: "Sarah is too busy",
});
const chId = change.body.request.id;
check("circle change is held", change.body.request.status === "held" && change.body.request.type === "circle_change");
const c2 = await api("sarah", "POST", `/api/requests/${chId}/votes`, { decision: "decline" });
check("Sarah declines -> swap blocked", c2.body.request.status === "declined");
const circ = await api("margaret", "GET", "/api/circle");
check("circle still v1 with Sarah", circ.body.circle.version === 1 && circ.body.circle.members.some((m) => m.memberId === users.sarah.id));

// a legitimate change: raise limit to $6,000 with approvals
const legit = await api("margaret", "POST", "/api/circle/proposals", { rules: { ...rules, dollarLimitCents: 600000 } });
await api("sarah", "POST", `/api/requests/${legit.body.request.id}/votes`, { decision: "approve" });
await api("helen", "POST", `/api/requests/${legit.body.request.id}/votes`, { decision: "approve" });
const circ2 = await api("margaret", "GET", "/api/circle");
check("approved circle change -> v2 verified", circ2.body.circle.version === 2 && circ2.body.circle.policy.dollarLimitCents === 600000 && !circ2.body.circle.tamperDetected);

const audit = await api("margaret", "GET", "/api/audit");
check("audit trail recorded", audit.body.events.length > 10, `${audit.body.events.length} events`);
console.log("\nAudit (oldest first):");
for (const e of [...audit.body.events].reverse()) console.log(`  [${e.kind}] ${e.actorName}: ${e.message}`);
