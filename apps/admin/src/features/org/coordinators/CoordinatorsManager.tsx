'use client';

import { useCoordinators, useRevokeCoordinator } from '@pg/api-client';
import type { CoordinatorAssignmentDTO, CoordinatorDTO } from '@pg/types';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '@pg/ui';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { StaffOnboardingSection } from '../onboarding/StaffOnboardingSection';
import { orgErrorKey } from '../orgError';
import { CoordinatorAssignModal } from './CoordinatorAssignModal';

/**
 * Admin Coordinators module: lists users holding active panchayat assignments
 * (each user may hold several — shown as panchayat chips), with an assign flow
 * and per-assignment revoke (confirmed, soft-revoke server-side).
 */
export function CoordinatorsManager() {
  const t = useTranslations('admin.coordinators');
  const tErr = useTranslations();
  const client = useApiClient();
  const query = useCoordinators(client);
  const revokeMut = useRevokeCoordinator(client);

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<{
    coord: CoordinatorDTO;
    panchayat: CoordinatorAssignmentDTO;
  } | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  function confirmRevoke() {
    if (!revoking) return;
    revokeMut.mutate(revoking.panchayat.assignmentId, {
      onSuccess: () => setRevoking(null),
      onError: (err) => setActionError(tErr(orgErrorKey(err))),
    });
  }

  const coords = query.data ?? [];

  return (
    <div className="flex flex-col gap-6" data-testid="coordinators-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button onClick={() => setAssignOpen(true)} data-testid="coordinator-assign-button">
            {t('assignSubmit')}
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState label={t('title')} data-testid="coordinators-loading" />
      ) : query.isError ? (
        <ErrorState title={tErr('errors.generic')} data-testid="coordinators-error" />
      ) : coords.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} data-testid="coordinators-empty" />
      ) : (
        <div className="flex flex-col gap-3" data-testid="coordinators-list">
          {coords.map((coord) => (
            <Card key={coord.userId} className="p-4" data-testid="coordinator-card">
              <div className="flex flex-col gap-3">
                <div className="text-sm">
                  <span className="font-medium text-neutral-900">{coord.fullName ?? t('unnamedUser')}</span>
                  <span className="text-neutral-500"> · {coord.phone}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {coord.panchayats.map((pan) => (
                    <span
                      key={pan.assignmentId}
                      className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1 text-xs text-neutral-700"
                      data-testid="coordinator-panchayat-chip"
                    >
                      {pan.panchayatCode} · {pan.panchayatName}
                      <button
                        type="button"
                        aria-label={t('revokeAria', { panchayat: pan.panchayatName })}
                        onClick={() => {
                          setActionError(null);
                          setRevoking({ coord, panchayat: pan });
                        }}
                        data-testid="coordinator-revoke"
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

      <StaffOnboardingSection role="COORDINATOR" />

      <CoordinatorAssignModal
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
            name: revoking?.coord.fullName ?? revoking?.coord.phone ?? '',
            panchayat: revoking?.panchayat.panchayatName ?? '',
          })
        }
        confirmLabel={t('revoke')}
        destructive
        loading={revokeMut.isPending}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
        data-testid="coordinator-revoke-confirm"
      />
    </div>
  );
}
