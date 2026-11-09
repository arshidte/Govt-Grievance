'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { AuthShell } from '../../../components/AuthShell';
import { VerifyForm } from '../../../features/auth/VerifyForm';

/**
 * Code-entry step of the admin (staff) login flow. Public (see
 * middleware.ts PUBLIC_PATHS) since the user has no session cookie yet at
 * this point. Expects `?phone=` (set by `/login`'s redirect on a
 * successful request-otp); without it, there is nothing to verify, so we
 * send the user back to `/login`. Mirrors the citizen app's
 * `src/app/[locale]/verify/page.tsx`.
 *
 * On successful verification: the BFF proxy has already relayed the
 * `pg_session` cookie to the browser (same-origin) by the time
 * `useVerifyOtp`'s promise resolves. Unlike citizen (which branches to
 * `/register` for an incomplete profile), admin has no register flow —
 * staff identities are SEEDED (Task 16), never self-registered — so this
 * always navigates to `/` (the dashboard home) and lets the `(app)`
 * layout's SERVER-side `requireStaff` gate (Task 25) decide: a seeded
 * staff user sees the dashboard, a citizen session sees `ForbiddenState`.
 * We deliberately do NOT re-implement or duplicate that role check here,
 * and we don't leak WHY a citizen might be forbidden — routing is the
 * same regardless of the account's role.
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

  return (
    // Revamp P4a — centered auth layout via the shared admin `AuthShell`.
    // The OTP cells (and their "Digit N of 6" aria-labels), the change-number
    // action, and the exact verify->dashboard navigation below all stay in
    // `VerifyForm`/this callback, unchanged — only the surrounding chrome moved.
    <AuthShell appName={tCommon('appName')} title={t('verifyTitle')}>
      <VerifyForm
        phone={phone}
        onChangeNumber={() => router.push(`/${locale}/login`)}
        onVerified={() => router.push(`/${locale}/`)}
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
