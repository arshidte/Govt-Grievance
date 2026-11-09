import { CheckCircle2, CircleSlash } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Active/inactive status pill for org entities (panchayats, wards). Status is
 * conveyed by icon + text, never color alone (a11y requirement). The issue
 * `StatusBadge` is domain-specific to grievance lifecycle statuses, so this
 * small local badge covers the simpler active/inactive case.
 */
export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations('common');
  return (
    <span
      data-testid="active-badge"
      data-active={active}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-green-50 text-status-resolved'
          : 'bg-neutral-100 text-neutral-500',
      ].join(' ')}
    >
      {active ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {active ? t('active') : t('inactive')}
    </span>
  );
}
