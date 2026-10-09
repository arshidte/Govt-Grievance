'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { RegisterForm } from '../../../features/auth/RegisterForm';

/**
 * Profile-completion step, shown right after a first-time verify-otp
 * (new citizen accounts have no `fullName` yet — see verify/page.tsx).
 * Listed in middleware.ts PUBLIC_PATHS per that file's instructions: the
 * middleware only checks session-cookie PRESENCE, and by the time a user
 * reaches this page they already have one (set during verify-otp); it's
 * public here mainly so the auth gate's redirect-to-/login logic doesn't
 * need special-casing this transitional page.
 */
export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const locale = useLocale();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{t('registerTitle')}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t('registerSubtitle')}</p>
        </div>

        <RegisterForm onSaved={() => router.push(`/${locale}/home`)} />
      </div>
    </main>
  );
}
