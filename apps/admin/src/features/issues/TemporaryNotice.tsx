'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@pg/ui';

/**
 * Interim-screen banner for the Task 24 staff triage screen (spec §12
 * "Admin app — temporary staff triage screen"). This whole screen (list +
 * detail + transition control) is a STOPGAP: the long-term home for staff
 * triage is the shared MOBILE app with role switching (a later milestone),
 * not a permanent admin-web feature. This component exists purely to make
 * that explicit to whoever is using the screen, so it is rendered at the
 * top of both the list and the detail view — never silently.
 */
export function TemporaryNotice() {
  const t = useTranslations('staffTriage');

  return (
    <Alert variant="info" title={t('noticeTitle')} data-testid="temporary-notice">
      {t('noticeBody')}
    </Alert>
  );
}
