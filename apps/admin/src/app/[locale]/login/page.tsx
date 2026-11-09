'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { AuthShell } from '../../../components/AuthShell';
import { LoginForm } from '../../../features/auth/LoginForm';

/**
 * Phone-entry step of the admin (staff) login flow (see middleware.ts
 * PUBLIC_PATHS — this route must stay reachable without a session cookie,
 * or the redirect target itself would be gated, causing a redirect loop).
 * Mirrors the citizen app's `src/app/[locale]/login/page.tsx`. On a
 * successful `request-otp`, navigates to `/verify` carrying the submitted
 * phone as a query param so that page can show it and submit
 * `{ phone, code }` together.
 *
 * Supersedes T25's placeholder page (static copy only, no form) now that
 * the real OTP flow exists.
 */
export default function LoginPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();

  return (
    // Revamp P4a — centered auth layout via the shared admin `AuthShell`
    // (mirrors citizen). The required `admin-login-page` testid is stamped
    // onto the shell's `<main>` root via `rootProps` so admin-auth.spec +
    // the RTL suite keep finding the page root exactly where they expect.
    <AuthShell
      appName={tCommon('appName')}
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      rootProps={{ 'data-testid': 'admin-login-page' }}
    >
      <LoginForm
        onRequested={(phone) =>
          router.push(`/${locale}/verify?phone=${encodeURIComponent(phone)}`)
        }
      />
    </AuthShell>
  );
}
