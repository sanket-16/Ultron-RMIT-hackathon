# TideCloak setup

Skip this while the app is in **dev mode** (one-click demo users). Do this when you want real Tide sign-in.

## 1. Start TideCloak (Docker)

Docker Desktop on, port 8080 free. From the repo root:

```powershell
@"
KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=pick-a-long-random-password
"@ | Set-Content .\.env.tidecloak

New-Item -ItemType Directory -Force .\data | Out-Null
Get-Content .\.env.tidecloak | ForEach-Object {
  if ($_ -match '^(.*?)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
}

docker pull tideorg/tidecloak-dev:latest
docker rm -f tidecloak 2>$null
docker run -d --name tidecloak `
  -v "${PWD}/data:/opt/keycloak/data/h2" `
  -p 8080:8080 `
  -e KC_BOOTSTRAP_ADMIN_USERNAME=$env:KC_BOOTSTRAP_ADMIN_USERNAME `
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=$env:KC_BOOTSTRAP_ADMIN_PASSWORD `
  tideorg/tidecloak-dev:latest
```

Wait ~1 min, then open http://localhost:8080 — login `admin` + that password.

Don’t append `start-dev` to `docker run`. Don’t commit `.env.tidecloak` or `data/`.

## 2. Realm, client, roles

In the admin UI:

1. Realm **`guardian-circle`**. Turn on Tide (IdP) and IGA.
2. Client **`guardian-circle-app`**: public, standard flow on.  
   Redirects: `http://localhost:3000/*`  
   Web origins: `http://localhost:3000`
3. Realm roles: `principal`, `circle_member`, `requester`.
4. Clients → guardian-circle-app → Action → **Download adapter config** → save as repo-root `tidecloak.json` (replaces the placeholder). **Commit it** — public client config only.

Demo users (sign up via Tide, then assign roles):

| Person   | Roles                        |
| -------- | ---------------------------- |
| Margaret | `principal`                  |
| Sarah    | `circle_member`              |
| James    | `circle_member`, `requester` |
| Helen    | `circle_member`              |

## 3. Point the app at it

`.env.local`:

```env
NEXT_PUBLIC_GUARDIAN_AUTH_MODE=tide
GUARDIAN_ENABLE_TAMPER_DEMO=1
```

Restart `npm run dev`. Open `/signin`.  
`GET /api/health-auth` should show `authMode: "tide"` and `tideConfigured: true`.

Back to demo users anytime: set `NEXT_PUBLIC_GUARDIAN_AUTH_MODE=dev`.
