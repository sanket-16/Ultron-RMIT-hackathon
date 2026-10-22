# Guardian Circle (Ultron RMIT Hackathon)

Margaret picks a small circle of people she trusts. Big decisions need enough of them to agree. Nobody can override that alone, including the people who run the app.

## Run it

```bash
npm install
cp .env.example .env.local   # dev mode: demo users, no TideCloak needed yet
npm run dev
```

Open `http://localhost:3000/signin`, then use **`/home`** (and `/setup`, `/demo`) as the main product path.

**Judge walkthrough:** [docs/DEMO.md](docs/DEMO.md) — seed story, $80k decline, DB tamper, care-home approve, and `npm run demo:e2e`.

For real TideCloak, see [docs/tidecloak-setup.md](docs/tidecloak-setup.md). The API for the UI is in [docs/api-contracts.md](docs/api-contracts.md).

## How the authority works

- **A vote is a signed token, not a database row.** When a member taps Approve, the app stores their fresh access token, which TideCloak signs with a key split across Tide's network. Before anything is carried out, `lib/authority/engine.ts` checks every vote again: the signature, that it's the right person, that they hold the `circle_member` role, that they aren't the requester, and that the token was issued after the request existed and was used only once.
- **The stored status is only a mirror.** Setting a request to `approved` in the database, or inserting fake votes, does nothing. `POST /api/demo/tamper` shows this live.
- **Rules form a chain.** Margaret's first setup carries her own signed token. Each later change must be a `circle_change` request that the existing circle approved. A rule row slipped into the database breaks the chain and is ignored. The threshold can never drop below 2.
- **Who is a member is decided in TideCloak.** The `circle_member` role is gated by IGA quorum approval, so it can't be granted by one admin.

### Known limits (next steps)

- A vote proves *who* approved and *when*, but not the exact request contents. The next step is to have members sign the request bytes through Tide (`initializeTideRequest` / `executeTideRequest` with a Forseti policy). Then a vote also binds to the amount and payee.
- Stored tokens are bearer tokens until they expire. Turning on DPoP (see the setup doc) binds them to the member's browser.
- The default store is in memory. Person B's Drizzle store plugs into `lib/authority/store.ts`.
