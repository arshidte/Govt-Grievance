import { RepresentativesManager } from '../../../../features/org/representatives/RepresentativesManager';

/**
 * Admin Representatives management (org-management milestone — replaces the
 * `ModulePage` placeholder). Staff gate + admin-only server enforcement apply.
 */
export default function RepresentativesPage() {
  return <RepresentativesManager />;
}
