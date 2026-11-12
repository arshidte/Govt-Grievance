'use client';

/**
 * MSG91 OTP widget integration (exposeMethods mode).
 *
 * In production (`NEXT_PUBLIC_MSG91_PROVIDER === 'live'`) this lazy-loads the
 * MSG91 widget script and drives its window-exposed `sendOtp` / `verifyOtp` /
 * `retryOtp` methods. `verifyOtp` resolves to the widget's opaque access token,
 * which the caller posts to `POST /auth/verify-token`; the server validates it
 * with MSG91 and issues the session (the browser never sends a phone the server
 * trusts).
 *
 * In dev/test (default, anything other than 'live') NO external script loads:
 * `sendOtp` / `retryOtp` are no-ops and `verifyOtp` returns a `test-otp:<phone>`
 * token that the server's MOCK verifier trusts — so local dev and the Playwright
 * browser e2e work without an MSG91 account. The server's own env guard
 * (`MSG91_PROVIDER`) independently refuses the mock verifier in production, so a
 * forged `test-otp:` token is never accepted by a real deployment.
 */
const IS_LIVE = process.env.NEXT_PUBLIC_MSG91_PROVIDER === 'live';
const WIDGET_ID = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID ?? '';
const TOKEN_AUTH = process.env.NEXT_PUBLIC_MSG91_TOKEN_AUTH ?? '';
const SCRIPT_SRC = 'https://verify.msg91.com/otp-provider.js';

type WidgetCallback = (data: unknown) => void;
interface Msg91Window extends Window {
  initSendOTP?: (config: Record<string, unknown>) => void;
  sendOtp?: (identifier: string, success?: WidgetCallback, failure?: WidgetCallback) => void;
  verifyOtp?: (otp: string, success?: WidgetCallback, failure?: WidgetCallback) => void;
  retryOtp?: (channel: string | null, success?: WidgetCallback, failure?: WidgetCallback) => void;
}

/** MSG91 expects the mobile with its country code but WITHOUT the leading `+`. */
function toIdentifier(phone: string): string {
  return phone.replace(/^\+/, '');
}

/** Reads the access token out of the widget's verify success payload. */
function extractToken(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const token = d.message ?? d.accessToken ?? d['access-token'] ?? d.token;
    if (typeof token === 'string') return token;
  }
  throw new Error('msg91: could not read access token from widget response');
}

let loadPromise: Promise<void> | null = null;
function loadWidget(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Msg91Window;
    if (w.initSendOTP && w.sendOtp) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      try {
        (window as unknown as Msg91Window).initSendOTP?.({
          widgetId: WIDGET_ID,
          tokenAuth: TOKEN_AUTH,
          exposeMethods: true,
          success: () => {},
          failure: () => {},
        });
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('msg91: initSendOTP failed'));
      }
    };
    script.onerror = () => reject(new Error('msg91: failed to load widget script'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function failureError(err: unknown, fallback: string): Error {
  return new Error(typeof err === 'string' ? err : fallback);
}

/** Sends an OTP to `phone`. No-op in mock mode (the server trusts the test token). */
export async function sendOtp(phone: string): Promise<void> {
  if (!IS_LIVE) return;
  await loadWidget();
  const w = window as unknown as Msg91Window;
  await new Promise<void>((resolve, reject) => {
    if (!w.sendOtp) return reject(new Error('msg91: sendOtp unavailable'));
    w.sendOtp(toIdentifier(phone), () => resolve(), (err) => reject(failureError(err, 'msg91: sendOtp failed')));
  });
}

/** Resends the OTP (widget default channel). No-op in mock mode. */
export async function retryOtp(): Promise<void> {
  if (!IS_LIVE) return;
  await loadWidget();
  const w = window as unknown as Msg91Window;
  await new Promise<void>((resolve, reject) => {
    if (!w.retryOtp) return reject(new Error('msg91: retryOtp unavailable'));
    w.retryOtp(null, () => resolve(), (err) => reject(failureError(err, 'msg91: retryOtp failed')));
  });
}

/**
 * Verifies the entered `code` and resolves to the access token the caller
 * exchanges for a session. In mock mode returns `test-otp:<phone>` (the `code`
 * is ignored — the mock server verifier trusts the phone).
 */
export async function verifyOtp(phone: string, code: string): Promise<string> {
  if (!IS_LIVE) return `test-otp:${phone}`;
  await loadWidget();
  const w = window as unknown as Msg91Window;
  return new Promise<string>((resolve, reject) => {
    if (!w.verifyOtp) return reject(new Error('msg91: verifyOtp unavailable'));
    w.verifyOtp(
      code,
      (data) => {
        try {
          resolve(extractToken(data));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('msg91: verify parse failed'));
        }
      },
      (err) => reject(failureError(err, 'msg91: verifyOtp failed')),
    );
  });
}
