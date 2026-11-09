import { CoordinatorsManager } from '../../../../features/org/coordinators/CoordinatorsManager';

/**
 * Admin Coordinators management (org-management milestone — replaces the
 * `ModulePage` placeholder). Staff gate + admin-only server enforcement apply.
 */
export default function CoordinatorsPage() {
  return <CoordinatorsManager />;
}
