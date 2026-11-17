# Deploy — start here

Staging on free tiers: **Neon** (Postgres) + **Render** (API) + **Vercel** (citizen + admin).

➡️ **Full walkthrough:** [`apps/api/docs/staging-deploy.md`](apps/api/docs/staging-deploy.md)
➡️ **Auth (MSG91) details:** [`apps/api/docs/msg91-otp.md`](apps/api/docs/msg91-otp.md)
➡️ **DB least-privilege (prod hardening, optional for staging):** [`apps/api/docs/db-least-privilege.md`](apps/api/docs/db-least-privilege.md)

## TL;DR

1. **Neon** → create DB; `DATABASE_URL` = pooled, `DIRECT_DATABASE_URL` = direct (both `?sslmode=require`); run `prisma migrate deploy` + `db seed`.
2. **Render** → New → Blueprint → this repo (`render.yaml`); set secrets: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `MSG91_AUTHKEY`, `CORS_ORIGIN_CITIZEN/ADMIN`. Also `MSG91_PROVIDER=live`.
3. **Vercel** → import twice; Root Directory `apps/citizen` / `apps/admin` (each has `vercel.json`); set `API_INTERNAL_URL` (= Render URL), `SESSION_COOKIE_NAME=pg_session`, `NEXT_PUBLIC_MSG91_PROVIDER=live`, `NEXT_PUBLIC_MSG91_WIDGET_ID`, `NEXT_PUBLIC_MSG91_TOKEN_AUTH`.
4. Put the Vercel URLs into Render's `CORS_ORIGIN_*`; **whitelist both domains in the MSG91 dashboard**.
5. Log in with a **real phone**, then promote it to ADMIN (SQL snippet in staging-deploy.md §5). Seed phones can't receive live OTP.

## Notes

- Secrets go in each platform's env UI — **never committed**. Rotate the MSG91 authkey if it was shared.
- **Attachments are ephemeral** on Render free (local-disk, no persistent volume); fine for staging demos. Add an R2/S3 `StorageProvider` when durability is needed.
- Render free cold-starts after ~15 min idle; Neon free auto-suspends on idle.
