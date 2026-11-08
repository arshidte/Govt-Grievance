'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { AuthShell } from '../../../components/AuthShell';
import { LoginForm } from '../../../features/auth/LoginForm';

/**
 * Phone-entry step of the citizen login flow (see middleware.ts
 * PUBLIC_PATHS — this route must stay reachable without a session cookie).
 * On a successful `request-otp`, navigates to `/verify` carrying the
 * submitted phone as a query param so that page can show it and submit
 * `{ phone, code }` together.
 *
 * Revamp P3 — centered auth layout via the shared `AuthShell`; the form
 * (and its `login-phone-input` / `login-submit` testids + validation) is
 * unchanged.
 */
export default function LoginPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();

  return (
    <AuthShell
      appName={tCommon('appName')}
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
    >
      <LoginForm
        onRequested={(phone) =>
          router.push(`/${locale}/verify?phone=${encodeURIComponent(phone)}`)
        }
      />
    </AuthShell>
  );
}
