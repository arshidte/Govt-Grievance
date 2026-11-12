# MSG91 OTP widget authentication

Authentication (citizen login, admin/staff login, and staff-onboarding
verification) is driven by the **MSG91 OTP widget**. This replaced the previous
server-generated OTP (`OtpService` + `OtpChallenge` + SMS provider), which has
been removed.

## How it works

MSG91 inverts the usual flow: the **browser widget** sends and verifies the OTP
itself and returns an opaque JWT **access token**. Our server never trusts a
client-supplied phone — it validates the access token with MSG91 and uses the
identifier MSG91 vouches for.

```
Browser (widget)                         API                         MSG91
  sendOtp(phone) ───────────────────────────────────────────────▶ (SMS)
  user enters code
  verifyOtp(code) ──────────────────────────────────────────────▶ verify
     ◀────────────── access token (JWT) ──────────────────────────
  POST /auth/verify-token { accessToken } ─▶ Msg91Verifier
                                             .verifyAccessToken ──▶ verifyAccessToken
                                               ◀── { type:'success', message: phone }
                                             findOrCreateCitizenByPhone
                                             SessionService.create → Set-Cookie
     ◀──────────────── MeResponse + pg_session cookie ────────────
```

- **Login:** `POST /auth/verify-token { accessToken }` → session cookie. Replaces
  `POST /auth/request-otp` + `POST /auth/verify-otp` (both removed).
- **Staff onboarding:** the admin's browser runs the widget against the **staff
  member's** phone; `POST /onboarding/:id/verify { accessToken }` validates the
  token and requires the verified phone to match the pending onboarding.
  `POST /onboarding/:id/resend` just extends the pending window — the widget
  (`retryOtp`) performs the actual resend.

## Server trust boundary

`apps/api/src/auth/msg91/` is the single place a verified identifier becomes a
trusted phone:

- `Msg91Verifier` (`MSG91_VERIFIER` DI token) — `verifyAccessToken(token) → { phone }`.
- `Msg91HttpVerifier` (**live**) — `POST {MSG91_VERIFY_URL}` with
  `{ authkey, 'access-token' }`; on `{ type:'success', message }` the `message`
  is the verified mobile, normalized to `+91…` (`phone.ts`). A rejected token →
  uniform `401 invalid_token`; MSG91 unreachable → `503 otp_provider_unavailable`.
- `MockMsg91Verifier` (**dev/test**) — trusts a `test-otp:<phone>` token and
  returns that phone. No network. Lets the unit/e2e/Playwright suites mint
  sessions without the external service.

Selection is by `MSG91_PROVIDER` (`msg91.module.ts`), mirroring the former
`SmsProvider` seam.

## Configuration

**Server** (`apps/api`):

| Var | Purpose |
| --- | --- |
| `MSG91_PROVIDER` | `mock` (dev/test) or `live`. The API refuses to boot with `mock` when `NODE_ENV=production`. |
| `MSG91_AUTHKEY` | Server secret ("authkey"). **Required** when `live`. Never commit a real value. |
| `MSG91_VERIFY_URL` | Optional override of the MSG91 verify endpoint. |

**Client** (`apps/citizen`, `apps/admin`) — `NEXT_PUBLIC_*`, embedded at build time:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MSG91_PROVIDER` | `mock` (skip the external widget; use a test token) or `live`. |
| `NEXT_PUBLIC_MSG91_WIDGET_ID` | MSG91 widget id (from the MSG91 dashboard). |
| `NEXT_PUBLIC_MSG91_TOKEN_AUTH` | MSG91 widget client token. |

The widget integration lives in `apps/*/src/features/auth/otpWidget.ts`
(`sendOtp` / `verifyOtp` / `retryOtp`). In `mock` mode it loads no script and
`verifyOtp` returns `test-otp:<phone>`; in `live` mode it lazy-loads
`https://verify.msg91.com/otp-provider.js` with `exposeMethods: true` and drives
the window methods.

## Security notes

- The server trusts **only** the phone returned by MSG91's `verifyAccessToken`,
  never a client-supplied phone/code.
- The mock verifier accepts forged `test-otp:` tokens **by design**, so it must
  never run in production. Two fences: `MSG91_PROVIDER` selection
  (`msg91.module.ts`) and the boot-time `env.ts` guard that rejects
  `NODE_ENV=production` + non-`live`.
- Access tokens are never logged (they authenticate a login); only the
  non-sensitive outcome is logged.
- The `/auth/verify-token` route keeps the tight per-IP `/auth/*` throttle.
  MSG91 owns send/verify rate limiting on its side.

## What CI verifies vs. what needs a live account

- **Verified in CI/local:** the full server flow + both frontends against the
  **mock** verifier (unit + e2e + the Playwright browser journeys log in via the
  mock `test-otp:` path). The live `Msg91HttpVerifier` success/reject/timeout
  branches are unit-tested with a mocked `fetch`.
- **Needs a real MSG91 account + browser (not covered here):** the live widget
  script loading/behavior, the exact shape of MSG91's verify responses, and the
  real `verifyAccessToken` round-trip. Validate these in a staging environment
  with `MSG91_PROVIDER=live` + `NEXT_PUBLIC_MSG91_PROVIDER=live` and real
  credentials before production.

## Deployment checklist

1. Set server `MSG91_PROVIDER=live` + `MSG91_AUTHKEY=<secret>` (secret store).
2. Build the web apps with `NEXT_PUBLIC_MSG91_PROVIDER=live`,
   `NEXT_PUBLIC_MSG91_WIDGET_ID`, `NEXT_PUBLIC_MSG91_TOKEN_AUTH`.
3. Smoke-test login + staff onboarding on staging with real credentials.
4. Confirm no `test-otp:` token is ever accepted (the production env guard
   enforces this at boot).
