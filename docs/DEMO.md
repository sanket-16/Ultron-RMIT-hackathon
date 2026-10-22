# Judge demo walkthrough

One-page path for the Guardian Circle hackathon demo. Use **dev mode** (no TideCloak required).

## 1. Configure

1. `npm install`
2. Copy `.env.example` → `.env.local`
3. Confirm:
   - `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=dev`
   - `GUARDIAN_ENABLE_TAMPER_DEMO=1`
   - Optional: set `DATABASE_URL` to a Neon Postgres URL (without it, the in-memory store is used)
4. `npm run dev`
5. Open `http://localhost:3000/signin`

## 2. Seed the story (as Margaret)

1. Sign in as **Margaret**
2. Open **`/demo`**
3. Click **Seed story** — resets the store, sets Margaret’s circle (Sarah, James, Helen; 2 of 3; $5,000 limit), and creates the two held requests

**Manual setup instead:** sign in once as Sarah, James, and Helen (so they exist), then as Margaret open **`/setup`**, pick the three members, threshold 2, dollar limit $5,000, and protected types. Create James’s $80k request and Margaret’s care-home invoice from the product screens (`/home`, `/requests/new`).

## 3. Live walkthrough

1. **James $80k declined** — Sign in as Sarah or Helen → **`/home`** → decline **“Invest for Mum”** ($80k). Status stays blocked / not released without enough approvals.
2. **Database tamper** — Sign in as anyone in the circle → **`/demo`** → run the vote/policy tamper on the held $80k request. Funds do **not** move; rejected or ignored “votes” prove the DB mirror is not authority.
3. **Care-home approved** — Sign in as Sarah and Helen in turn → **`/home`** → approve **“Care home invoice”**. With 2 of 3, the request completes.

Primary product routes: **`/home`**, **`/setup`**, **`/demo`** (and `/requests/*`, `/audit`, `/circle`). The older `/protected` console is not the main path.

## 4. Automated check

With the same env (dev + `GUARDIAN_ENABLE_TAMPER_DEMO=1`) and a fresh store:

```bash
npm run demo:e2e
```

Runs the demo script and attack cases against a running (or freshly started) server at `http://localhost:3000`.
