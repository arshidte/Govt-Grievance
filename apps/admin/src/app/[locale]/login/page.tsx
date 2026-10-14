'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

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
  const router = useRouter();
  const locale = useLocale();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-6" data-testid="admin-login-page">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{t('loginTitle')}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t('loginSubtitle')}</p>
        </div>

        <LoginForm
          onRequested={(phone) =>
            router.push(`/${locale}/verify?phone=${encodeURIComponent(phone)}`)
          }
        />
      </div>
    </main>
  );
}
