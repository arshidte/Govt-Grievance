'use client';

import { Alert, Button } from '@pg/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAuth } from './useAuth';

/**
 * Logs the current staff user out. Mirrors the citizen app's
 * `src/features/auth/LogoutButton.tsx` — see that file's header comment
 * for the full rationale (cache-clear + replace-navigation + error
 * handling). Calls the shared `useAuth().logout` mutation (which already
 * revokes the session + clears the `pg_session` cookie server-side, and
 * invalidates `queryKeys.me` on success — see `./useAuth.ts`).
 *
 * On a successful logout: `queryClient.clear()` wipes the ENTIRE TanStack
 * Query cache (not just `me`) — important on shared staff workstations, so
 * the next person signing in doesn't see this session's cached issues for
 * a moment — then `router.replace` (not `push`) to `/login`, so the back
 * button can't return to the now-dead authed shell.
 *
 * On error: stays on the page, shows a generic translated inline error
 * (`errors.generic`, reused rather than minting a new key) via `@pg/ui`'s
 * `Alert`, and the button re-enables (`isPending` naturally resets once
 * the mutation settles).
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
