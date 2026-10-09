import { HomeOverview } from '../../../../features/home/HomeOverview';

/**
 * Authed home overview — gated by `middleware.ts` (requires the
 * `pg_session` cookie) and wrapped by `(app)/layout.tsx`'s shell (bottom
 * nav). `data-testid="home-page"` is kept for the T23 Playwright spec
 * (authored, execution deferred to T28) which asserts on it after login.
 */
export default function HomePage() {
  return (
    <div data-testid="home-page">
      <HomeOverview />
    </div>
  );
}
