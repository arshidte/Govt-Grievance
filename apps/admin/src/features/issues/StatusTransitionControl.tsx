'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiClientError, useTransitionIssue } from '@pg/api-client';
import type { IssueDetailDTO, IssueStatus } from '@pg/types';
import { Alert, Button, StatusBadge } from '@pg/ui';

import { useApiClient } from '../auth/api-client';

export interface StatusTransitionControlProps {
  issue: IssueDetailDTO;
}

/**
 * The SINGLE allowed next status for each CURRENT status, for the staff
 * triage screen's UX only (spec §12). This is NOT the server's authoritative
 * transition table — the API (`issue-transition.service.ts`) independently
 * enforces the real state machine and rejects anything else with 422
 * `invalid_transition` (skips, backward moves, CLOSED/REOPENED, etc., all
 * require a different flow this screen does not offer). This map exists
 * only so the UI can show ONE forward-looking button instead of a free
 * dropdown over all 10 statuses — if the server's rules ever diverge from
 * this map, the server wins and the mutation simply errors.
 *
 * A status with NO entry here (RESOLVED, CLOSED, REOPENED, and the other
 * statuses this screen doesn't drive forward) renders NO control.
 */
const NEXT_STATUS: Partial<Record<IssueStatus, IssueStatus>> = {
  SUBMITTED: 'ACKNOWLEDGED',
  ACKNOWLEDGED: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
};

const MAX_NOTE_LENGTH = 1000;

/**
 * Maps a transition-mutation failure to a translated message. The 409
 * `stale_status` case (another actor already moved the issue — spec §4's
 * optimistic-concurrency rejection) gets a specific "already updated"
 * message; 422 `invalid_transition` (should be rare given the single-next
 * UI, but the server is authoritative) gets a generic "not allowed"
 * message; anything else (network, 5xx) falls back to a generic error.
 */
function errorMessageKey(error: unknown): 'transitionStaleStatus' | 'transitionInvalid' | 'transitionGenericError' {
  if (error instanceof ApiClientError) {
    if (error.code === 'stale_status') return 'transitionStaleStatus';
    if (error.code === 'invalid_transition') return 'transitionInvalid';
  }
  return 'transitionGenericError';
}

/**
 * Staff triage status-transition control (spec §12). Offers ONLY the
 * single allowed next status for the issue's CURRENT status (never a
 * free choice, never a skip/backward move) alongside a REQUIRED note
 * textarea, and submits via `useTransitionIssue`. When the current status
 * has no next entry in `NEXT_STATUS` (e.g. RESOLVED), renders no control —
 * just a neutral "no further action" message — rather than an empty/
 * disabled form.
 */
export function StatusTransitionControl({ issue }: StatusTransitionControlProps) {
  const t = useTranslations('staffTriage');
  // Root (unnamespaced) translator — `StatusBadge` resolves its label via
  // `@pg/i18n`'s `statusLabelKey`, which returns a FULLY-QUALIFIED key
  // (e.g. "status.acknowledged"), so it needs the root translator, not one
  // namespaced to "staffTriage" (mirrors `IssueCard`/`Timeline`'s usage).
  const tRoot = useTranslations();
  const client = useApiClient();
  const transition = useTransitionIssue(client);
  const [note, setNote] = useState('');

  const nextStatus = NEXT_STATUS[issue.status];

  if (!nextStatus) {
    return (
      <p className="text-sm text-neutral-500" data-testid="transition-none">
        {t('transitionNone')}
      </p>
    );
  }

  const trimmedNote = note.trim();
  const isNoteValid = trimmedNote.length > 0 && note.length <= MAX_NOTE_LENGTH;
  const canSubmit = isNoteValid && !transition.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    transition.mutate(
      { id: issue.id, input: { toStatus: nextStatus, note: trimmedNote } },
      {
        onSuccess: () => setNote(''),
      },
    );
  };

  return (
    // Revamp P4b — the bordered panel moved UP to the parent `Card` wrapping
    // this control, so the form itself is now a plain flex column. Markup/
    // testids/logic are otherwise unchanged; only the surrounding chrome and
    // the input chrome were restyled to the design-language tokens.
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-testid="status-transition-control"
    >
      <h2 className="text-base font-semibold text-neutral-900">{t('transitionTitle')}</h2>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-600">{t('transitionTargetLabel')}</span>
        <div data-testid="transition-target">
          <StatusBadge status={nextStatus} t={tRoot} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="transition-note" className="text-sm font-medium text-neutral-600">
          {t('transitionNoteLabel')}
          <span aria-hidden="true" className="text-status-escalated"> *</span>
        </label>
        <textarea
          id="transition-note"
          data-testid="transition-note-input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          required
          rows={3}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-sm text-neutral-500">{t('transitionNoteHint')}</p>
      </div>

      {transition.isError && (
        <Alert variant="error" data-testid="transition-error">
          {t(errorMessageKey(transition.error))}
        </Alert>
      )}

      <Button type="submit" disabled={!canSubmit} loading={transition.isPending} data-testid="transition-submit" className="self-start">
        {transition.isPending ? t('transitionSubmitting') : t('transitionSubmit')}
      </Button>
    </form>
  );
}
