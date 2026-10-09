'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { LoginForm } from '../../../features/auth/LoginForm';

/**
 * Phone-entry step of the citizen login flow (see middleware.ts
 * PUBLIC_PATHS — this route must stay reachable without a session cookie).
 * On a successful `request-otp`, navigates to `/verify` carrying the
 * submitted phone as a query param so that page can show it and submit
 * `{ phone, code }` together.
 */
export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const locale = useLocale();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
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
