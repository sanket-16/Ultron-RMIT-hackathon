# Guardian Circle (Ultron RMIT Hackathon)

Margaret picks a small circle of people she trusts. Big decisions need enough of them to agree. Nobody can override that alone, including the people who run the app.

## Project overview

**Guardian Circle lets an older person choose a small circle of trusted people who must agree together before big financial decisions go ahead, and no single person, not even the app's administrator, can override that.**

**Vision & originality.** Protecting an older person's money is all-or-nothing today: they keep full control, or one person takes over through a power of attorney. Guardian Circle is a third option. Everyday spending stays Margaret's. Big decisions, such as anything over a limit she sets, need 2 of the 3 people she chose.

**Trust constraint insight.** 1 in 6 older Australians experienced elder abuse in a single year, half of it by family members (AIFS, 2021), and one attorney can act alone. A normal app just moves that trust to whoever runs the database: an admin, a hacker or a relative with admin access could switch the rule off.

**Value & impact.** Older Australians keep their independence, families see who asked and who approved, and no scammer or pushy relative can empty their savings. Example: James asks to move $80,000 "to invest it for Mum". Sarah and Helen decline, and the money stays.

**Why TideCloak matters.** Every vote is a TideCloak token signed by a key nobody holds: it is split across Tide's network, and 14 of 20 nodes must cooperate to sign. Before releasing anything, the app re-verifies every vote's signature, identity and timing, so database edits and forged votes do nothing. Circle membership is a TideCloak role whose assignment needs quorum approval, so no single admin can make themselves a member.

**Prototype & storytelling.** Watch three moments: James's $80,000 request is held and declined; a "rogue admin" marks it approved in the database and the release is still refused; the care-home invoice gets two approvals and goes through.

**Demo video:** [demo.mp4](demo.mp4)

---

## Run it

```bash
npm install
cp .env.example .env.local   # dev mode: demo users, no TideCloak needed yet
npm run dev
```

Open `http://localhost:3000/signin`, then use **`/home`** (and `/setup`, `/demo`) as the main product path.

**Judge walkthrough:** [docs/DEMO.md](docs/DEMO.md) — seed story, $80k decline, DB tamper, care-home approve, and `npm run demo:e2e`.

**Full project context** (done / left, how it works, conventions): [docs/CONTEXT.md](docs/CONTEXT.md).

For real TideCloak, see [docs/tidecloak-setup.md](docs/tidecloak-setup.md). The API for the UI is in [docs/api-contracts.md](docs/api-contracts.md).

### Running with real TideCloak (as shown in the demo video)

1. Start TideCloak in Docker: `docker run --name mytidecloak -d -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=password tideorg/tidecloak-dev:latest`
2. Provision a Tide realm with `npm init @tidecloak/nextjs@latest`. It creates the realm and client, activates the free Tide licence and enrols the first admin. Copy the generated `tidecloak.json` into this repo's root.
3. Create realm roles `principal`, `circle_member` and `requester`. Create and enrol the users (Margaret `principal`; Sarah, James and Helen `circle_member`; James also `requester`). Approve the resulting change requests in the Tide console.
4. In `.env.local`, set `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=tide` and `GUARDIAN_ENABLE_TAMPER_DEMO=1`, then run `npm run dev`. `GET /api/health-auth` should show `authMode: "tide"`.

## How the authority works

- **A vote is a signed token, not a database row.** When a member taps Approve, the app stores their fresh access token, which TideCloak signs with a key split across Tide's network. Before anything is carried out, `lib/authority/engine.ts` checks every vote again: the signature, that it's the right person, that they hold the `circle_member` role, that they aren't the requester, and that the token was issued after the request existed and was used only once.
- **The stored status is only a mirror.** Setting a request to `approved` in the database, or inserting fake votes, does nothing. `POST /api/demo/tamper` shows this live.
- **Rules form a chain.** Margaret's first setup carries her own signed token. Each later change must be a `circle_change` request that the existing circle approved. A rule row slipped into the database breaks the chain and is ignored. The threshold can never drop below 2.
- **Who is a member is decided in TideCloak.** The `circle_member` role is gated by IGA quorum approval, so it can't be granted by one admin.

### Known limits (next steps)

- A vote proves *who* approved and *when*, but not the exact request contents. The next step is to have members sign the request bytes through Tide (`initializeTideRequest` / `executeTideRequest` with a Forseti policy). Then a vote also binds to the amount and payee.
- Stored tokens are bearer tokens until they expire. Turning on DPoP (see the setup doc) binds them to the member's browser.
- The default store is in memory. Person B's Drizzle store plugs into `lib/authority/store.ts`.
- The free hackathon Tide licence limits the number of enrolled users, so in the demo video the realm admin also plays Helen. In production these would be different people.

## Sources

- Australian Institute of Family Studies, *National Elder Abuse Prevalence Study: Final Report* (2021): https://aifs.gov.au/all-research/research-reports/national-elder-abuse-prevalence-study-final-report
