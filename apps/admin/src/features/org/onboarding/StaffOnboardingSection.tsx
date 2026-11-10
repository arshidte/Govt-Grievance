'use client';

import { useCancelOnboarding, useOnboardings } from '@pg/api-client';
import type { OnboardingRole, StaffOnboardingDTO } from '@pg/types';
import { Button, Card } from '@pg/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { orgErrorKey } from '../orgError';
import { OnboardingOtpModal } from './OnboardingOtpModal';
import { StaffOnboardingWizard } from './StaffOnboardingWizard';

/**
 * Pending-onboarding panel embedded on the Representatives / Coordinators
 * pages. Shows this role's pending onboardings with their status and
 * per-record actions (enter OTP to verify, or cancel), plus the "onboard new
 * staff" entry point. Admin-only surface.
 */
export function StaffOnboardingSection({ role }: { role: OnboardingRole }) {
  const t = useTranslations('admin.onboarding');
  const tErr = useTranslations();
  const client = useApiClient();
  // Fetch pending onboardings (server filters by status); narrow to this role.
  const query = useOnboardings(client, 'pending');
  const cancelMut = useCancelOnboarding(client);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [otpTarget, setOtpTarget] = React.useState<StaffOnboardingDTO | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<StaffOnboardingDTO | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const rows = (query.data ?? []).filter((o) => o.role === role);

  function confirmCancel() {
    if (!cancelTarget) return;
    cancelMut.mutate(cancelTarget.id, {
      onSuccess: () => setCancelTarget(null),
      onError: (err) => setActionError(tErr(orgErrorKey(err))),
    });
  }

  return (
    <section className="flex flex-col gap-3" data-testid="onboarding-section">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-900">{t('pendingTitle')}</h2>
        <Button variant="secondary" onClick={() => setWizardOpen(true)} data-testid="onboarding-start-button">
          {t('startButton')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500" data-testid="onboarding-empty">
          {t('pendingEmpty')}
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="onboarding-list">
          {rows.map((o) => (
            <Card key={o.id} className="flex flex-col gap-2 p-3" data-testid="onboarding-item">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-neutral-900">{o.phone}</span>
                  <StatusPill status={o.status} label={t(`status.${o.status}`)} />
                  {!o.userExists && <span className="ml-2 text-xs text-neutral-500">{t('newAccountTag')}</span>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={o.status !== 'pending'}
                    onClick={() => {
                      setActionError(null);
                      setOtpTarget(o);
                    }}
                    data-testid="onboarding-enter-code"
                  >
                    {t('enterCode')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setActionError(null);
                      setCancelTarget(o);
                    }}
                    data-testid="onboarding-cancel"
                  >
                    {t('cancelOnboarding')}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 text-xs text-neutral-600">
                {o.scopes.map((s) => (
                  <span key={s.id} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">
                    {s.label}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <StaffOnboardingWizard
        open={wizardOpen}
        role={role}
        onClose={() => setWizardOpen(false)}
        onInitiated={() => {
          setWizardOpen(false);
          void query.refetch();
        }}
      />

      <OnboardingOtpModal
        open={otpTarget !== null}
        onboarding={otpTarget}
        onClose={() => setOtpTarget(null)}
        onVerified={() => {
          setOtpTarget(null);
          void query.refetch();
        }}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title={t('cancelConfirmTitle')}
        message={actionError ?? t('cancelConfirmMessage', { phone: cancelTarget?.phone ?? '' })}
        confirmLabel={t('cancelOnboarding')}
        destructive
        loading={cancelMut.isPending}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
        data-testid="onboarding-cancel-confirm"
      />
    </section>
  );
}

function StatusPill({ status, label }: { status: StaffOnboardingDTO['status']; label: string }) {
  const tint =
    status === 'pending'
      ? 'bg-amber-50 text-status-inProgress'
      : status === 'verified'
        ? 'bg-green-50 text-status-resolved'
        : 'bg-neutral-100 text-neutral-500';
  return (
    <span
      data-testid="onboarding-status"
      data-status={status}
      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${tint}`}
    >
      {label}
    </span>
  );
}
