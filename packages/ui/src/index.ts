export * from './tokens';
export * from './fonts';
export * from './lib/cn';
export * from './components/button';
export * from './components/input';
export * from './components/otp-input';
export * from './components/card';
export * from './components/alert';
export * from './components/status-badge';
export * from './components/priority-badge';
export * from './components/empty-state';
export * from './components/loading-state';
export * from './components/error-state';
export * from './components/forbidden-state';
export * from './components/skeleton';
export * from './components/toast';
export * from './components/language-switcher';
export * from './components/sidebar-nav';
export * from './components/page-header';
export * from './components/avatar';
export * from './components/stat-card';
export * from './components/table';
export * from './components/search-input';
export * from './components/select';

/**
 * TODO(M2): Not built in this milestone — scaffold placeholder only.
 * These components are deferred until their consuming feature lands in
 * M2/M3 (citizen list/filter screens, admin case tables, grievance
 * timelines). Listed here so downstream consumers know the absence is
 * intentional, not an oversight:
 *   - DatePicker   (M2 — grievance filing date fields)
 *   - FileUploader (M2 — grievance attachment upload)
 *   - FilterPanel  (M2 — citizen/admin list filtering)
 *   - Pagination   (M2 — paginated list views)
 *   - Timeline     (M3 — grievance status history view)
 *
 * NOTE: `Table` graduated out of this list in revamp P2b-2 — it now ships as
 * a presentational component above (`./components/table`).
 */
export const DEFERRED_COMPONENTS = [
  'DatePicker',
  'FileUploader',
  'FilterPanel',
  'Pagination',
  'Timeline',
] as const;
