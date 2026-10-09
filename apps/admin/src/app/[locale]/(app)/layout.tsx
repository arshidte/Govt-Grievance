import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ApiClientError } from '@pg/api-client';
import { ForbiddenState } from '@pg/ui';
import { api } from '../../../lib/api';
import { requireStaff } from '../../../lib/requireStaff';

/**
 * Authed shell layout for the `(app)` route group (the future admin
 * dashboard — T27). Route groups don't affect the URL, so this adds no new
 * segment; it wraps every route under it with the SERVER-side staff gate
 * (Review Focus #4).
 *
 * `middleware.ts` only checks COOKIE PRESENCE (it cannot see roles — they
 * aren't in the cookie), so two distinct failure modes are handled HERE,
 * server-side, via `GET /auth/me`:
 *
 * 1. No session / an invalid-or-expired cookie that slipped past the
 *    middleware's presence check (the cookie exists but the backend
 *    rejects it) -> `api.getMe()` throws `ApiClientError` with `status
 *    401` -> redirect to `/login`, same destination as the middleware's
 *    own gate.
 * 2. A VALID session for a user who holds no `STAFF_ROLES` role (e.g. a
 *    citizen session reaching the admin app) -> `getMe()` succeeds but
 *    `requireStaff(me)` is false -> render `ForbiddenState` (NOT a crash,
 *    NOT a blank page), with localized title/description from the
 *    `admin` message namespace.
 *
 * Any other error from `getMe()` (network/unknown) is NOT swallowed here —
 * it propagates to Next's nearest error boundary, since silently treating
 * every failure as "forbidden" or "logged out" would hide real backend
 * problems behind a misleading UI state.
 */
export default async function AuthedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  let me;
  try {
    me = await api.getMe();
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) {
      redirect(`/${locale}/login`);
    }
    throw err;
  }

  if (!requireStaff(me)) {
    const t = await getTranslations({ locale, namespace: 'admin' });
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <ForbiddenState
          title={t('forbiddenTitle')}
          description={t('forbiddenDescription')}
          data-testid="admin-forbidden-state"
        />
      </main>
    );
  }

  return <>{children}</>;
}
