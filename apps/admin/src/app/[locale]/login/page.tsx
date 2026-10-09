import { useTranslations } from 'next-intl';

/**
 * Minimal staff login placeholder (see src/middleware.ts PUBLIC_PATHS —
 * this route must stay reachable without a session cookie). Full login
 * (phone/OTP form, submit handling) is Task 26's scope; this task only
 * needs a page that exists and renders localized copy, so the
 * middleware's redirect target and the authed layout's unauthenticated
 * redirect both land somewhere real rather than a 404.
 */
export default function LoginPage() {
  const t = useTranslations('admin');

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-2 text-center" data-testid="admin-login-page">
        <h1 className="text-xl font-semibold text-neutral-900">{t('loginTitle')}</h1>
        <p className="text-sm text-neutral-600">{t('loginSubtitle')}</p>
      </div>
    </main>
  );
}
