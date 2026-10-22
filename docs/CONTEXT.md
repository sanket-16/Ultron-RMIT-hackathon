# Guardian Circle — project context

**Single source of truth** for what’s done, what’s left, how the system works, conventions, demo, and session history.  
Repo: [sanket-16/Ultron-RMIT-hackathon](https://github.com/sanket-16/Ultron-RMIT-hackathon) · Local: `c:\Users\san16\Documents\projects\ultron` · Branch tip: **`feat/circle-ux`**

Related docs (detail only — this file is the handoff): [DEMO.md](./DEMO.md) · [api-contracts.md](./api-contracts.md) · [tidecloak-setup.md](./tidecloak-setup.md) · README.

---

## 1. Product in one paragraph

**Guardian Circle** lets Margaret (the principal) name a small trusted circle. Big money / life decisions are **held** until enough circle members approve. The database is only a **mirror for the UI** — **signed tokens** (TideCloak in production, local JWT in **dev**) are what actually authorise release. Flipping a DB row to `approved` does nothing.

**Demo story:** James’s **$80k** “invest for Mum” is declined; a **care-home invoice** gets two approvals and completes; a **tamper** demo shows rogue DB edits cannot move funds.

**Stack:** Next.js 16 (App Router) + React 19 + Tailwind 4 · TideCloak (`@tidecloak/nextjs`, `@tidecloak/verify`) · Postgres + Drizzle (Neon optional) · Zod · jose (dev JWTs).

---

## 2. Done vs left

### Done

| Area | What’s in the tree |
| --- | --- |
| **Person A — authority** | TideCloak provider + **dev** one-click users; JWT verify; authority engine; hold / vote / release; circle setup + proposals; `/api/demo/tamper`; `/protected` console |
| **Person B — UX** | Landing; `/signin`; `/home`, `/setup`, `/requests/*`, `/audit`, `/circle`, `/demo`; AppShell; linen/sage theme; empty/loading/error polish |
| **Data** | Drizzle schema + Neon `AuthorityStore`; falls back to in-memory without `DATABASE_URL` |
| **Demo tooling** | `/demo` Seed + Reset + tamper; `POST /api/demo/seed\|reset\|status\|tamper`; `docs/DEMO.md`; `npm run demo:e2e` (resets first) |
| **Docs** | This file, DEMO, api-contracts, tidecloak-setup; README links CONTEXT |
| **PRs (open)** | [#2 feat/authority](https://github.com/sanket-16/Ultron-RMIT-hackathon/pull/2) · [#3 feat/circle-ux](https://github.com/sanket-16/Ultron-RMIT-hackathon/pull/3) |
| **Local** | Branch `feat/circle-ux`; app at `http://localhost:3000` in **dev** mode; Neon wired via gitignored `.env.local` |

### Left (not blocking the local demo)

1. **Merge PRs** — merge **#2** then **#3** into `main` (`feat/circle-ux` already contains authority + UX + demo).
2. **Real Tide mode** — replace placeholder `tidecloak.json`, create realm users/roles, set `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=tide` ([tidecloak-setup.md](./tidecloak-setup.md)). Optional for judging if you stay on **dev**.
3. **IGA second admin** — for the live “James can’t quietly add a member” Tide-admin story.
4. **Optional hardening** — DPoP; Forseti binding votes to request bytes (see README known limits).
5. **Repo hygiene** — delete merged side branches on GitHub if desired (`feat/demo-*`, polish, proposals, tamper, theme, landing fixes, etc.).

**Intentionally out of scope for this handoff:** Neon DB password rotation (ops hygiene, not product work).

---

## 3. People / roles (work split)

Original brief: Project store `docs/guardian-circle-work-split.md`.

| Person | Owns | Folders |
| --- | --- | --- |
| **A — Authority** | TideCloak, verify, engine, protected APIs | `lib/tidecloak/`, `lib/authority/`, `app/api/**`, `proxy.ts` |
| **B — Circle UX** | Screens, Drizzle/Neon mirror, seed UX | `app/(app)/`, `components/`, `drizzle/`, `lib/db/` |

Shared contracts: `lib/contracts/` + [api-contracts.md](./api-contracts.md).  
**UI never marks payment complete** — only `releaseRequest` in `lib/authority/engine.ts` does.

### Cast (dev ids)

| Who | Username | Id | Roles |
| --- | --- | --- | --- |
| Margaret | `margaret` | `dev-margaret` | `principal` |
| Sarah | `sarah` | `dev-sarah` | `circle_member` |
| James | `james` | `dev-james` | `circle_member`, `requester` |
| Helen | `helen` | `dev-helen` | `circle_member` |
| Mallory | `mallory` | `dev-mallory` | outsider (`requester` only) |

Defined in `lib/tidecloak/dev.ts`. Seed / setup assume Margaret + Sarah + James + Helen.

### Shared domain contracts

1. Roles: `principal`, `circle_member`, `requester`
2. Request types: `large_withdrawal`, `sell_home`, `change_will`, `care_home_move`, `other` (+ `circle_change` for rule updates)
3. Statuses: `held` → `approved` | `declined` | `cancelled` (or `executed` for small everyday actions)
4. Vote: `{ requestId, memberId, decision: approve\|decline, at }` plus stored **evidence token**
5. Policy mirror: `{ threshold, memberCount, dollarLimitCents, protectedTypes[] }` — UI only; engine enforces
6. Threshold never below **2** (`MIN_THRESHOLD`)

---

## 4. How it works

### Auth modes

| Mode | When | Tokens |
| --- | --- | --- |
| **`dev`** | Default while `tidecloak.json` is placeholder, or `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=dev` | Local JWT via `GUARDIAN_DEV_SECRET`; one-click `/signin` |
| **`tide`** | Real adapter + `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=tide` | TideCloak SSO + silent SSO (`/silent-check-sso.html`) |

Use `useGuardianAuth()` → `authFetch(url, init, { fresh: true })` for **votes** (needs a fresh token).  
Page protection: `proxy.ts` (`PROTECTED_PAGES` + `config.matcher` must stay in sync). APIs verify tokens themselves.

### Authority loop

1. Margaret **setup** → policy v1 with her signed token as genesis evidence.
2. Request created → **held** if non-principal requester, protected type, or over dollar limit.
3. Members **vote** → each vote stores the voter’s **evidence token**.
4. Engine **re-verifies** every vote on read/release (signature, role, not requester, issued after request, no replay).
5. At threshold → status approved + **mocked** payment. Below threshold / declines → blocked.
6. DB status / fake votes / lowered threshold → **ignored** (`/api/demo/tamper`).

Circle **rule changes** after setup go through `/api/circle/proposals` → held `circle_change` request → same vote rules. `circle.tamperDetected` is true when stored rules were edited; the circle keeps the last verified rules.

### Storage

- Interface: `AuthorityStore` in `lib/authority/store.ts`.
- Default: in-memory (resets on server restart).
- With `DATABASE_URL`: `DrizzleAuthorityStore` via `lib/db/register.ts` (imported from authority service).
- Tables: `users`, `policy_versions`, `requests`, `votes`, `audit_events`, `payments`.
- Push schema: `npm run db:push` (drizzle-kit loads `.env.local`).
- Neon URL: omit `channel_binding` if the driver complains; secrets only in **gitignored** `.env.local`.

### Key files

| Path | Role |
| --- | --- |
| `lib/authority/engine.ts` | Hold / vote / release / verify |
| `lib/authority/store.ts` | Store interface + memory default |
| `lib/authority/demo-seed.ts` | Seed cast + $80k + care-home story |
| `lib/tidecloak/dev.ts` | Dev users + local JWT |
| `lib/tidecloak/client.ts` | `useGuardianAuth` / `authFetch` |
| `lib/contracts/index.ts` | Zod / shared types |
| `lib/db/` + `drizzle/` | Neon schema + Drizzle store |
| `proxy.ts` | Page auth redirect |
| `app/(app)/*` | Product screens |
| `app/api/**` | REST surface |
| `components/AppShell.tsx` + `components/ui/` | Shell + primitives |
| `scripts/e2e-demo.mjs` | Automated demo + attack cases |

### Product routes

| Path | Purpose |
| --- | --- |
| `/` | Marketing landing |
| `/signin` | Dev user picker / Tide login |
| `/home` | Pending + recent; approve/decline |
| `/setup` | Principal first-time circle |
| `/requests/new`, `/requests/[id]` | Create / detail |
| `/audit` | Audit trail |
| `/circle` | Propose rule/member changes |
| `/demo` | Seed, reset, tamper |
| `/protected` | Older authority console (not the main path) |

### API surface (summary)

Full tables: [api-contracts.md](./api-contracts.md).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health-auth` | Auth mode + user |
| GET/POST | `/api/circle` | View / one-time principal setup |
| GET | `/api/circle/candidates` | Signed-in `circle_member`s |
| POST | `/api/circle/proposals` | Held `circle_change` |
| GET/POST | `/api/requests` | List / create |
| GET | `/api/requests/:id` | Detail + live `authority` |
| POST | `/api/requests/:id/votes` | Approve/decline (`fresh: true`) |
| POST | `/api/requests/:id/cancel` | Requester or principal |
| POST | `/api/requests/:id/release` | Carry out when authorised |
| GET | `/api/audit` | Audit events |
| POST | `/api/demo/tamper` | Fake votes / policy / undo |
| POST | `/api/demo/reset` | Wipe store (dev + tamper flag) |
| POST | `/api/demo/seed` | Reset + story (principal) |
| GET | `/api/demo/status` | Demo flags + circle |
| GET/POST/DELETE | `/api/dev/login` | Dev-only sign-in |

Errors: `{ error, details? }` with 400 / 401 / 403 / 404 / 409 / 423.

UI should prefer `request.authority` (fresh from evidence) over raw `status` for held / success / fail screens. Show `authority.rejectedVotes` after tampering. `request.canVote` gates Approve / Decline.

---

## 5. Conventions

### Git / branches

- Prefer **`feat/…`** and **`fix/…`** (not `cursor/…`).
- Main line for the full app: **`feat/circle-ux`**.
- Authority-only tip: **`feat/authority`**.
- Stacked PR order: merge **#2** then **#3**.
- Parallel experiments used git **worktrees**; remove when finished (`git worktree remove`). Side branches that fed circle-ux: `feat/demo-api`, `feat/demo-ui`, `feat/demo-docs`, `feat/demo-ready`, `feat/circle-ux-polish`, `feat/circle-proposals-ui`, `feat/tamper-demo-ui`, `feat/app-theme`, `fix/landing-hero-contrast`, `fix/landing-type-hero`.

### Frontend

- Theme: linen background / forest sage accent (`app/globals.css`).
- One typeface: **Source Sans 3** (brand via weight/size, not a second family).
- Large tap targets (~`h-14`); calm copy; avoid purple/glow AI-default look.
- Landing: brand-first hero; keep copy readable over the photo (veil). No card clutter in the hero.

### Backend / API

- Don’t invent new shapes — extend `lib/contracts`.
- Person B never “marks paid.”
- Demo-only routes gated by `GUARDIAN_ENABLE_TAMPER_DEMO=1`; seed/reset also require **dev** mode.
- Protect new pages in both `PROTECTED_PAGES` and `proxy.ts` `config.matcher`.

### Secrets

- Never commit `.env.local`, `.env.tidecloak`, Neon passwords, or Tide admin passwords.
- `.env.example` has placeholders only.
- `tidecloak.json` may be committed once it’s the real (non-secret) adapter config; placeholder stays until Tide is wired.

### Env (local)

```env
NEXT_PUBLIC_GUARDIAN_AUTH_MODE=dev
GUARDIAN_DEV_SECRET=...
GUARDIAN_ENABLE_TAMPER_DEMO=1
DATABASE_URL=postgresql://...   # optional Neon
```

---

## 6. How the demo works

Full judge steps: **[DEMO.md](./DEMO.md)**.

### Short path (manual)

1. `npm run dev` → `/signin` as **Margaret**.
2. **`/demo` → Seed story** (clears store; sets circle Sarah/James/Helen, 2 of 3, $5,000; creates $80k held + care-home held).
3. **Sarah / Helen** decline “Invest for Mum” on `/home`.
4. **`/demo`** → run vote/policy **tamper** on the $80k request → funds still do not move; rejected/ignored votes prove DB ≠ authority.
5. **Sarah + Helen** approve care-home → completes (mocked payment).
6. Optional: browse `/audit`, `/circle` proposals.

### Automated

```bash
npm run demo:e2e
```

Needs the same env (dev + tamper flag). Script resets first (as Margaret), then runs demo + attack cases against `http://localhost:3000`.

### Seed internals

`lib/authority/demo-seed.ts`: `clearAll` → recreate cast users → Margaret setup → James $80k request → care-home request. Seed requires principal + `GUARDIAN_ENABLE_TAMPER_DEMO=1` + auth mode **dev**.

---

## 7. TideCloak notes (explored, not required for demo)

- Raziel Tide MCP was **not available** in the cloud worker; local Docker path was used instead.
- Docker image: `tideorg/tidecloak-dev` on port **8080**; bootstrap admin only in gitignored `.env.tidecloak`.
- Licence / email / T&C acceptance required once for a local realm; `tidecloak.json` must be UTF-8 **without BOM**.
- Product work stayed on **`dev`** after bootstrap so the circle UX and Neon path could ship without depending on Tide uptime.
- Silent SSO file: `/silent-check-sso.html`. Switch back anytime with `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=dev`.
- Full steps: [tidecloak-setup.md](./tidecloak-setup.md).

---

## 8. What we did on this machine (session history)

Rough chronology for handoff:

1. Cloned / checked out scaffold, then **Person A** `person-a/authority` (later renamed **`feat/authority`**).
2. Ran Next locally; explored Tide MCP / Docker TideCloak; licensed a local realm; **switched back to dev mode** for product work.
3. Built **Person B** on **`feat/circle-ux`**: landing, screens, Neon/Drizzle, theme, polish, proposals UI, tamper UI (parallel worktrees, then merged).
4. Branch rename: dropped `cursor/…` naming; use `feat/` / `fix/`.
5. Landing fixes: hero contrast veil; unified fonts to Source Sans 3; quieter hero image (no mismatched serif + random house).
6. Wired **Neon** via `.env.local` + `db:push` (URL never committed; `channel_binding` dropped for driver compatibility).
7. **Demo-ready**: `clearAll`, seed/reset/status APIs, `/demo` controls, DEMO docs, e2e reset-first; worktrees cleaned.
8. Opened PRs **#2** (authority) and **#3** (circle-ux).
9. Wrote this **CONTEXT.md** as the single project handoff (Neon password rotation excluded from “left”).

TideCloak Docker may still be running locally unused while auth mode is `dev`.

---

## 9. Quick commands

```bash
npm install
cp .env.example .env.local   # then set DATABASE_URL if using Neon
npm run db:push              # only with DATABASE_URL
npm run dev                  # http://localhost:3000
npm run demo:e2e             # automated demo + attack cases
npm run db:studio            # optional Drizzle Studio
```

### npm scripts

| Script | Purpose |
| --- | --- |
| `dev` / `build` / `start` / `lint` | Next.js lifecycle |
| `demo:e2e` | Seed/reset story + attack cases |
| `db:generate` / `db:push` / `db:studio` | Drizzle |

---

## 10. Open PRs

| PR | Branch | Merge order |
| --- | --- | --- |
| [#2](https://github.com/sanket-16/Ultron-RMIT-hackathon/pull/2) | `feat/authority` | First |
| [#3](https://github.com/sanket-16/Ultron-RMIT-hackathon/pull/3) | `feat/circle-ux` | Second (includes authority tip + UX + demo) |

When both are merged, local demo continues the same way on `main`. Prefer reviewing/running from **`feat/circle-ux`** / PR **#3** for the full product.
