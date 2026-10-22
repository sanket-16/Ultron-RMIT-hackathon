# API contracts (Person A ↔ Person B)

Types live in [`lib/contracts/index.ts`](../lib/contracts/index.ts). Import them from the UI. Don't copy them.

## Calling the API from the UI

```tsx
import { useGuardianAuth } from "@/lib/tidecloak/client";

const { ready, authenticated, user, login, logout, authFetch } = useGuardianAuth();

await authFetch("/api/requests");                                    // read
await authFetch("/api/requests", { method: "POST", body: JSON.stringify(input) });
await authFetch(`/api/requests/${id}/votes`, { method: "POST", body: JSON.stringify({ decision: "approve" }) },
  { fresh: true });                                                  // votes MUST use fresh: true
```

`user.roles` contains `principal`, `circle_member` or `requester`. Use it to pick which screens to show.
To protect a new page, add its path to `PROTECTED_PAGES` **and** `config.matcher` in [`proxy.ts`](../proxy.ts).

## Endpoints

All of them need a signed-in user. Errors come back as `{ error, details? }` with 400, 401, 403, 404, 409 or 423.

| Method | Path | Who | Body → Response |
| --- | --- | --- | --- |
| GET | `/api/health-auth` | anyone | → `{ authMode, authenticated, user }` |
| GET | `/api/circle` | any | → `{ circle: CircleView \| null }` |
| POST | `/api/circle` | principal, once | `CircleSetupInput` → `{ circle }` (201) |
| GET | `/api/circle/candidates` | principal, member | → `{ candidates: UserSummary[] }` (people who signed in with `circle_member`) |
| POST | `/api/circle/proposals` | principal, member | `CircleChangeInput` → `{ request }`: a held `circle_change` request |
| GET | `/api/requests` | circle | → `{ requests: RequestView[] }` (newest first) |
| POST | `/api/requests` | circle | `CreateRequestInput` → `{ request }`. Status is `held`, or `executed` for small everyday actions |
| GET | `/api/requests/:id` | circle | → `{ request }` |
| POST | `/api/requests/:id/votes` | member (not the requester) | `{ decision }` → `{ request }`. 401 with `details.code = "fresh_token_required"` means call again with `fresh: true` |
| POST | `/api/requests/:id/cancel` | requester or principal | → `{ request }` |
| POST | `/api/requests/:id/release` | circle | → `{ released, message, request }`. 403 when not authorised |
| GET | `/api/audit` | circle | → `{ events: AuditEventView[] }` (newest first) |
| POST | `/api/demo/tamper` | circle, demo flag on | `{ mode: "votes", requestId }` \| `{ mode: "policy" }` \| `{ mode: "undo" }` |
| POST | `/api/demo/reset` | any signed-in, demo flag + dev | → `{ ok: true }` (wipes authority store) |
| POST | `/api/demo/seed` | principal, demo flag + dev | → `{ circle, requests, nextSteps }` (reset + story seed) |
| GET | `/api/demo/status` | any signed-in | → `{ authMode, tamperEnabled, circle }` |
| GET/POST/DELETE | `/api/dev/login` | dev mode only | `{ username }` signs in as a demo user |

## What to show in the UI

- `request.status` is the stored value: `held`, `approved`, `declined`, `cancelled` or `executed`.
- `request.authority` is worked out fresh from signed evidence on every read. Use it for the "held / success / fail" screens:
  - `authority.approvals` / `authority.declines` list who voted and when.
  - `authority.reason` is a ready-made sentence, e.g. "1 of 2 approvals so far".
  - `authority.rejectedVotes` lists votes that failed verification (only appears after tampering). Show this in the security demo.
- `request.payment` is set once the action is carried out (mocked). `payment.action` is a ready-made sentence.
- `request.canVote` says whether to show the Approve / Decline buttons to this user.
- `circle.tamperDetected` is true when someone edited the stored rules. The circle keeps using the last verified rules.

## Rules (enforced server-side; the UI can't change them)

1. A request is **held** if any of these is true: someone other than the principal asked for it, its type is in `protectedTypes`, or `amountCents > dollarLimitCents`.
2. People can't vote on their own request. One vote per person. Votes are final.
3. A request is **approved** (and carried out) once `threshold` verified approvals exist. It is **declined** as soon as reaching the threshold becomes impossible.
4. The threshold is never below **2** (`MIN_THRESHOLD`) and never above the member count.
5. Setup happens once. After that, member or rule changes go through `/api/circle/proposals` and need the current circle's approval.
6. Person B never marks anything paid. Only `releaseRequest` in `lib/authority/engine.ts` can.

## Swapping in Drizzle (Person B)

The authority layer reads and writes through the `AuthorityStore` interface in [`lib/authority/store.ts`](../lib/authority/store.ts). The default keeps everything in memory, so it resets on server restart. To use Postgres:

```ts
import { setAuthorityStore } from "@/lib/authority/store";
setAuthorityStore(new DrizzleAuthorityStore(db)); // implement the interface with your tables
```

Store `evidenceToken` (on votes and the genesis policy) as `text`. `addPayment` must be idempotent per `requestId`, for example with a unique index.

In dev mode, seed users with the ids from `DEV_USERS` in [`lib/tidecloak/dev.ts`](../lib/tidecloak/dev.ts): `dev-margaret`, `dev-sarah`, `dev-james`, `dev-helen`.
