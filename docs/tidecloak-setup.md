# TideCloak setup (Person A)

The app runs in **dev mode** until `tidecloak.json` is replaced with a real adapter file.
Dev mode signs tokens with a local secret so the team can build. Switch to **tide mode** for the demo.

## 1. Realm and client

Use Tide's MCP in your coding agent, or the [TideCloak Quickstart](https://github.com/tide-foundation/tidecloak-gettingstarted), to start a TideCloak server. Then:

1. Create realm **`guardian-circle`** and turn on Tide (IdP + IGA).
2. Create client **`guardian-circle-app`**:
   - Public client (Client authentication **off**), Standard flow **on**.
   - Valid redirect URIs: `http://localhost:3000/*` (plus your deployed URL).
     Silent SSO uses `http://localhost:3000/silent-check-sso.html` (already in `public/`).
   - Web origins: `http://localhost:3000`.
3. Download the adapter config (Clients → guardian-circle-app → Action → Download adapter config).
   Save it as `tidecloak.json` in the repo root, replacing the placeholder.
   Only public client details are in this file, so it's safe to commit.

## 2. Roles

Create these **realm roles**: `principal`, `circle_member`, `requester`.

| User      | Roles                          |
| --------- | ------------------------------ |
| Margaret  | `principal`                    |
| Sarah     | `circle_member`                |
| James     | `circle_member`, `requester`   |
| Helen     | `circle_member`                |

Each person signs up through Tide (their key is split across Tide's network, not held by us).

## 3. IGA: role changes need a quorum

Turn on **IGA** for the realm. Once it's on, adding or removing `circle_member` creates a change request. That request needs approval from the realm's quorum of Tide admins before it takes effect. To match the story, make the circle members the realm's approvers. Then James can't quietly give his friend the `circle_member` role.

The app treats the `circle_member` role in a **Tide-signed token** as the only proof of membership. A database edit that adds someone to the circle won't help them, because their token won't carry the role.

## 4. Turn on tide mode

```bash
# .env.local
NEXT_PUBLIC_GUARDIAN_AUTH_MODE=tide
GUARDIAN_ENABLE_TAMPER_DEMO=1
```

Restart `npm run dev`, open `/signin`, sign in as each person once, then use `/protected` as Margaret to set up the circle.

Check: `GET /api/health-auth` returns `authMode: "tide"` with the user's roles and `vuid`.

## Optional: DPoP

To bind tokens to the browser, add `"useDPoP": { "mode": "auto" }` to `tidecloak.json` and add the DPoP route (see `node_modules/@tidecloak/nextjs/docs/FRONT_CHANNEL.md#serving-the-dpop-page`). Then a token copied out of the database is useless to anyone else.
