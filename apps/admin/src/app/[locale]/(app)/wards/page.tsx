import { Suspense } from 'react';

import { WardsManager } from '../../../../features/org/wards/WardsManager';

/**
 * Admin Wards management (org-management milestone — replaces the `ModulePage`
 * placeholder). `WardsManager` reads `?panchayatId=` via `useSearchParams`,
 * so it is wrapped in a Suspense boundary (Next 15 requirement). Staff gate +
 * admin-only server enforcement apply as for every org module.
 */
export default function WardsPage() {
  return (
    <Suspense fallback={null}>
      <WardsManager />
    </Suspense>
  );
}
