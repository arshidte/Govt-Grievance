'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { AuthShell } from '../../../components/AuthShell';
import { VerifyForm } from '../../../features/auth/VerifyForm';

/**
 * Code-entry step. Public (see middleware.ts PUBLIC_PATHS) since the user
 * has no session cookie yet at this point. Expects `?phone=` (set by
 * `/login`'s redirect on a successful request-otp); without it, there is
 * nothing to verify, so we send the user back to `/login`.
 *
 * On successful verification: the BFF proxy has already relayed the
 * `pg_session` cookie to the browser (same-origin) by the time
 * `useVerifyOtp`'s promise resolves. `MeResponse.fullName` being null means
 * the account has no profile yet (brand-new citizen) -> `/register`;
 * otherwise -> `/home`.
 */
function VerifyPageContent() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const phone = searchParams.get('phone');

  useEffect(() => {
    if (!phone) {
      router.replace(`/${locale}/login`);
    }
  }, [phone, locale, router]);

  if (!phone) {
    return null;
  }

  // Revamp P3 — centered auth layout via the shared `AuthShell`. The
  // phone-interpolated subtitle stays inside `VerifyForm` (next to the OTP
  // cells it describes), so the shell carries only the static title.
  return (
    <AuthShell appName={tCommon('appName')} title={t('verifyTitle')}>
      <VerifyForm
        phone={phone}
        onChangeNumber={() => router.push(`/${locale}/login`)}
        onVerified={(isProfileComplete) =>
          router.push(isProfileComplete ? `/${locale}/home` : `/${locale}/register`)
        }
      />
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
