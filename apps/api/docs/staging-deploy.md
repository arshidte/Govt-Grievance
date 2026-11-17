# Staging deployment (free tier)

A walkthrough for hosting the platform on free services for **staging**:

| Piece | Service | Notes |
| --- | --- | --- |
| Postgres | **Neon** (free) | Gives a **pooled** + **direct** URL → maps to `DATABASE_URL` + `DIRECT_DATABASE_URL`. |
| API (`apps/api`) | **Render** free Web Service | Long-lived Node server. Blueprint: [`render.yaml`](../../../render.yaml). |
| Citizen + Admin (Next.js) | **Vercel** free Hobby | Two projects from this monorepo. |

**Why it works across hosts:** the web apps use a **BFF proxy** — the browser only
talks to its own Vercel origin; Vercel forwards server-to-server to
`API_INTERNAL_URL` and relays `Set-Cookie`. So the session cookie is **first-party**
on the Vercel domain — no cross-site cookie/CORS problems, even though the API and
web apps are on different hosts. All hosts are HTTPS, so the `secure` cookie works.

> This is **staging**. It intentionally skips the M4D least-privilege DB role
> (uses the Neon role for both URLs) and the attachments are ephemeral (below).

---

## 1. Neon (database)

1. Create a Neon project (pick a region near you, e.g. Singapore).
2. From the dashboard copy **two** connection strings and append `?sslmode=require`:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** (no `-pooler`) → `DIRECT_DATABASE_URL`
3. Apply migrations + seed once from your machine:
   ```bash
   DIRECT_DATABASE_URL='<neon-direct>' pnpm --filter @pg/api exec prisma migrate deploy
   DATABASE_URL='<neon-direct>'        pnpm --filter @pg/api exec prisma db seed
   ```
   (The Render build also runs `migrate deploy` on every deploy, so step 3's
   migrate is optional — but seeding the reference data once is useful.)

## 2. Render (API)

Two ways:

**A. Blueprint (recommended):** Render → New → **Blueprint** → select this repo. It
reads [`render.yaml`](../../../render.yaml). Then open the service → **Environment**
and fill the secrets marked `sync: false`: `DATABASE_URL`, `DIRECT_DATABASE_URL`,
`MSG91_AUTHKEY`, `CORS_ORIGIN_CITIZEN`, `CORS_ORIGIN_ADMIN` (the last two you'll
know after step 3 — set placeholders now, update later).

**B. Manual Web Service** (if you prefer not to use the blueprint):
- **Root Directory:** repo root
- **Build:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @pg/api exec prisma generate && pnpm --filter @pg/api build && pnpm --filter @pg/api exec prisma migrate deploy`
- **Start:** `node apps/api/dist/main.js`
- **Health check path:** `/api/v1/health`
- **Env:** `NODE_ENV=production`, `MSG91_PROVIDER=live`, `MSG91_AUTHKEY`,
  `SESSION_COOKIE_NAME=pg_session`, `SESSION_TTL_HOURS=720`, `DATABASE_URL`,
  `DIRECT_DATABASE_URL`, `CORS_ORIGIN_CITIZEN`, `CORS_ORIGIN_ADMIN`. Node 20 comes
  from `.nvmrc`. Render injects `PORT`; the API binds to it (`main.ts`).

Note your API URL, e.g. `https://panchayat-api.onrender.com`.

## 3. Vercel (citizen + admin)

Import this repo **twice** (one project each):

| Setting | Citizen | Admin |
| --- | --- | --- |
| **Root Directory** | `apps/citizen` | `apps/admin` |

Env vars (both projects):
- `API_INTERNAL_URL` = your Render API URL (e.g. `https://panchayat-api.onrender.com`)
- `SESSION_COOKIE_NAME` = `pg_session` (must match the API)
- `NEXT_PUBLIC_MSG91_PROVIDER` = `live`
- `NEXT_PUBLIC_MSG91_WIDGET_ID` = `<your widget id>`
- `NEXT_PUBLIC_MSG91_TOKEN_AUTH` = `<your widget token-auth>`

Vercel auto-detects Next.js + the pnpm workspace. If the build fails to resolve
workspace packages, set the project's **Install Command** to `pnpm install` and
**Build Command** to `next build` (run from the app's Root Directory).

Note the two URLs, e.g. `https://panchayat-citizen.vercel.app`,
`https://panchayat-admin.vercel.app`.

## 4. Wire the loop

1. Put the two Vercel URLs into the Render API's `CORS_ORIGIN_CITIZEN` /
   `CORS_ORIGIN_ADMIN` and redeploy the API.
2. In the **MSG91 dashboard**, whitelist both Vercel domains for the widget
   (MSG91 validates the calling domain).

## 5. Bootstrap a real admin ⚠️

Under **live MSG91**, the seed's demo phones (`+919000000001`, …) are fake and
**cannot receive a real OTP**. So:

1. Open the citizen (or admin) app and log in with **your real phone** — this
   creates a citizen `User`.
2. Promote it to ADMIN in Neon (SQL editor):
   ```sql
   INSERT INTO "RoleAssignment" (id, "userId", role, "createdAt")
   SELECT gen_random_uuid()::text, id, 'ADMIN', now()
   FROM "User" WHERE phone = '+91XXXXXXXXXX';
   ```
3. Re-login (or refresh) the admin app — you now pass the `requireStaff` gate.

## 6. Smoke test

- Citizen: login (real OTP) → submit a grievance → see it + its timeline.
- Admin: login (your admin phone) → see the grievance → transition its status →
  onboard a staff member (the staff phone receives the real OTP).
- Confirm the MSG91 verify-response identifier maps correctly in
  `apps/api/src/auth/msg91/phone.ts` (adjust if MSG91 nests the phone differently).

## Free-tier caveats (expected)

- **Render free spins down after ~15 min idle** → first request cold-starts
  ~30–60 s.
- **Attachments are ephemeral.** Storage is local-disk (no object-store provider
  yet) and Render free has no persistent disk, so uploaded files are lost on
  redeploy/restart. Fine for a demo; add an S3/R2 `StorageProvider` before this
  matters.
- **Neon free** auto-suspends compute on idle (resumes on first query).
- **Secrets** (`MSG91_AUTHKEY`, DB URLs) live in each platform's env UI — never in
  git. Rotate the MSG91 authkey if it was ever shared in plaintext.
