'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { AuthShell } from '../../../components/AuthShell';
import { RegisterForm } from '../../../features/auth/RegisterForm';

/**
 * Profile-completion step, shown right after a first-time verify-otp
 * (new citizen accounts have no `fullName` yet — see verify/page.tsx).
 * Listed in middleware.ts PUBLIC_PATHS per that file's instructions: the
 * middleware only checks session-cookie PRESENCE, and by the time a user
 * reaches this page they already have one (set during verify-otp); it's
 * public here mainly so the auth gate's redirect-to-/login logic doesn't
 * need special-casing this transitional page.
 *
 * Revamp P3 — centered auth layout via the shared `AuthShell`; the form
 * (its "Full name" label + "Save and continue" button + validation) is
 * unchanged.
 */
export default function RegisterPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();

  return (
    <AuthShell
      appName={tCommon('appName')}
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
    >
      <RegisterForm onSaved={() => router.push(`/${locale}/home`)} />
    </AuthShell>
  );
}
