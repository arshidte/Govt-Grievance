import type { MeResponse, Role } from '@pg/types';
import { getTranslations } from 'next-intl/server';

import { DashboardOverview } from '../../../features/dashboard/DashboardOverview';
import { api } from '../../../lib/api';

/**
 * Picks the highest-privilege role to label the signed-in staff member's
 * scope in the dashboard header. Mirrors `Sidebar.primaryRoleKey` exactly
 * (ADMIN > COORDINATOR > REPRESENTATIVE, else the generic "staff" label) so
 * the header subtitle and the sidebar footer never disagree about the role.
 */
function primaryRoleKey(
  roles: MeResponse['roles'],
): 'admin' | 'coordinator' | 'representative' | 'staff' {
  const held = new Set<Role>(roles.map((r) => r.role));
  if (held.has('ADMIN')) return 'admin';
  if (held.has('COORDINATOR')) return 'coordinator';
  if (held.has('REPRESENTATIVE')) return 'representative';
  return 'staff';
}

/**
 * Admin dashboard home (revamp P4a). Reached only once the `(app)` route
 * group's layout (src/app/[locale]/(app)/layout.tsx) has confirmed both a
 * valid session and a staff role, and rendered the Sidebar/MobileDrawer shell
 * — this page itself does NO auth decision.
 *
 * It renders a REAL staff overview (`DashboardOverview`): the stat cards and
 * recent preview come entirely from the server-scoped `useStaffIssues` hook
 * (the same hook the triage list uses) — no new API, no fabricated metrics,
 * replacing the former hard-zeroed placeholder tiles.
 *
 * We additionally read `me` here — a plain READ, not an auth gate (the layout
 * already guaranteed staff) — purely to derive a role/scope LABEL for the
 * header subtitle. If that read fails for any reason we simply omit the label
 * and the overview falls back to its generic subtitle; the dashboard content
 * (the scoped counts) is driven client-side and is unaffected. The required
 * `admin-dashboard-page` testid lives on `DashboardOverview`'s root wrapper.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tAdmin = await getTranslations({ locale, namespace: 'admin' });

  // Best-effort role label for the header subtitle only — never blocks render.
  let roleLabel: string | undefined;
  try {
    const me = await api.getMe();
    roleLabel = tAdmin(`roles.${primaryRoleKey(me.roles)}`);
  } catch {
    roleLabel = undefined;
  }

  return <DashboardOverview roleLabel={roleLabel} />;
}
