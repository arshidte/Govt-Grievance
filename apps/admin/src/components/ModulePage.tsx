import { EmptyState } from '@pg/ui';

export interface ModulePageProps {
  title: string;
  description: string;
  testId: string;
}

/**
 * Shared "coming soon" shell for the 12 M2+ admin modules (brief: "each a
 * titled shell rendering an EmptyState"). Every module page under `(app)/`
 * is currently just a title + this EmptyState — a thin wrapper keeps that
 * identical structure in one place rather than duplicated 12 times, so
 * when each module gains its real content in M2+, only that one page file
 * changes.
 */
export function ModulePage({ title, description, testId }: ModulePageProps) {
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <EmptyState title={title} description={description} data-testid={`${testId}-empty-state`} />
    </div>
  );
}
