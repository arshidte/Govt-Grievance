'use client';

import { useRepresentatives, useRevokeRepresentative } from '@pg/api-client';
import type { RepresentativeAssignmentDTO, RepresentativeDTO } from '@pg/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@pg/ui';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { StaffOnboardingSection } from '../onboarding/StaffOnboardingSection';
import { orgErrorKey } from '../orgError';
import { RepresentativeAssignModal } from './RepresentativeAssignModal';

/**
 * Admin Representatives module: lists users holding active ward assignments
 * (each user may hold several — shown as ward chips), with an assign flow and
 * per-assignment revoke (confirmed). Revocation is a soft-revoke server-side;
 * the revoked ward immediately stops granting the user any representative
 * authorization.
 */
export function RepresentativesManager() {
  const t = useTranslations('admin.representatives');
  const tErr = useTranslations();
  const client = useApiClient();
  const query = useRepresentatives(client);
  const revokeMut = useRevokeRepresentative(client);

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<{
    rep: RepresentativeDTO;
    ward: RepresentativeAssignmentDTO;
  } | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  function confirmRevoke() {
    if (!revoking) return;
    revokeMut.mutate(revoking.ward.assignmentId, {
      onSuccess: () => setRevoking(null),
      onError: (err) => setActionError(tErr(orgErrorKey(err))),
    });
  }

  const reps = query.data ?? [];

  return (
    <div className="flex flex-col gap-6" data-testid="representatives-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button onClick={() => setAssignOpen(true)} data-testid="representative-assign-button">
            {t('assignSubmit')}
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState label={t('title')} data-testid="representatives-loading" />
      ) : query.isError ? (
        <ErrorState title={tErr('errors.generic')} data-testid="representatives-error" />
      ) : reps.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} data-testid="representatives-empty" />
      ) : (
        <div className="flex flex-col gap-3" data-testid="representatives-list">
          {reps.map((rep) => (
            <Card key={rep.userId} className="p-4" data-testid="representative-card">
              <div className="flex flex-col gap-3">
                <div className="text-sm">
                  <span className="font-medium text-neutral-900">{rep.fullName ?? t('unnamedUser')}</span>
                  <span className="text-neutral-500"> · {rep.phone}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rep.wards.map((ward) => (
                    <span
                      key={ward.assignmentId}
                      className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1 text-xs text-neutral-700"
                      data-testid="representative-ward-chip"
                    >
                      {ward.panchayatName} · {t('wardShort')} {ward.wardNumber}
                      <button
                        type="button"
                        aria-label={t('revokeAria', { ward: ward.wardNumber })}
                        onClick={() => {
                          setActionError(null);
                          setRevoking({ rep, ward });
                        }}
                        data-testid="representative-revoke"
                        className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <StaffOnboardingSection role="REPRESENTATIVE" />

      <RepresentativeAssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onAssigned={() => {
          setAssignOpen(false);
          void query.refetch();
        }}
      />

      <ConfirmDialog
        open={revoking !== null}
        title={t('revokeConfirmTitle')}
        message={
          actionError ??
          t('revokeConfirmMessage', {
            name: revoking?.rep.fullName ?? revoking?.rep.phone ?? '',
            ward: revoking?.ward.wardNumber ?? 0,
          })
        }
        confirmLabel={t('revoke')}
        destructive
        loading={revokeMut.isPending}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
        data-testid="representative-revoke-confirm"
      />
    </div>
  );
}
