'use client';

import { Alert, Button } from '@pg/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAuth } from './useAuth';

/**
 * Logs the current citizen out. Calls the shared `useAuth().logout`
 * mutation (which already revokes the session + clears the `pg_session`
 * cookie server-side, and invalidates `queryKeys.me` on success — see
 * `./useAuth.ts`'s header comment).
 *
 * On top of that shared invalidation, THIS component does two things of
 * its own on a successful logout:
 *  1. `queryClient.clear()` — wipes the ENTIRE TanStack Query cache, not
 *     just `me`. Without this, a second citizen signing in on the same
 *     shared device could still see the previous session's cached issues/
 *     notifications/profile for a moment (stale reads from the cache)
 *     before fresh fetches land.
 *  2. `router.replace(...)` (not `push`) to the login screen, so the
 *     browser's back button can't return to the now-dead authed page —
 *     same reasoning as `VerifyPage`'s redirect-when-no-phone guard.
 *
 * On error, we deliberately do NOT navigate (the user stays on whatever
 * authed page they were on) and surface a generic, translated inline
 * error via `@pg/ui`'s `Alert` (reusing `errors.generic` rather than
 * minting a new i18n key for a one-line fallback message).
 *
 * Error state is tracked locally (`hasError`, reset to false on every new
 * attempt) rather than relying solely on the mutation's own `isError` —
 * this component's `onError` callback is what flips it, so the alert shows
 * immediately for THIS click without waiting on a re-render driven purely
 * by the mutation object's own state.
 */
export function LogoutButton() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const { logout } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [hasError, setHasError] = useState(false);

  const handleClick = () => {
    setHasError(false);
    logout.mutate(undefined, {
      onSuccess: () => {
        // Clear the WHOLE cache (not just `me`) before leaving the authed
        // app, so a subsequent user on the same device never sees this
        // session's cached data.
        queryClient.clear();
        router.replace(`/${locale}/login`);
      },
      onError: () => {
        setHasError(true);
      },
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={logout.isPending}
        onClick={handleClick}
        data-testid="logout-button"
      >
        {t('logout')}
      </Button>

      {(hasError || logout.isError) && <Alert variant="error" title={tErrors('generic')} />}
    </div>
  );
}
