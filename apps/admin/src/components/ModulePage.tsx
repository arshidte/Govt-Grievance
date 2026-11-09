import { EmptyState, PageHeader } from '@pg/ui';

export interface ModulePageProps {
  title: string;
  description: string;
  testId: string;
}

/**
 * Shared "not available yet" shell for the M2+ admin modules (brief: "each a
 * titled shell rendering an EmptyState"). Every placeholder module page under
 * `(app)/` renders through this one wrapper, so when a module gains its real
 * content in M2+ only that page file changes.
 *
 * Revamp P4c — polished placeholder: the same `PageHeader` band the live
 * admin pages (dashboard / triage) use so placeholders don't read as a
 * different app, above a calm bordered panel holding the restyled
 * `EmptyState` (soft icon chip + an honest "arrives in a later milestone"
 * description). No fabricated data — just a deliberate empty surface.
 */
export function ModulePage({ title, description, testId }: ModulePageProps) {
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      <PageHeader title={title} />
      <div className="rounded-xl border border-neutral-200 bg-white">
        <EmptyState title={title} description={description} data-testid={`${testId}-empty-state`} />
      </div>
    </div>
  );
}
