'use client';

import {
  useAdminPanchayats,
  useAdminWards,
  useInitiateOnboarding,
  useSearchStaff,
} from '@pg/api-client';
import type { OnboardingRole, StaffUserDTO } from '@pg/types';
import { Alert, Button, Input, Select } from '@pg/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';
import { Modal } from '../../../components/Modal';
import { orgErrorKey } from '../orgError';

interface Props {
  open: boolean;
  role: OnboardingRole;
  onClose: () => void;
  onInitiated: () => void;
}

/**
 * Admin-initiated staff onboarding wizard: search a phone (existing user or a
 * new pending account) → choose active scope(s) → review → initiate (sends the
 * OTP). Verification happens afterwards from the pending list. Existing users
 * only are *searched*; a brand-new phone creates a pending account at verify
 * time (no separate registration flow). OTP values are never shown here.
 */
export function StaffOnboardingWizard({ open, role, onClose, onInitiated }: Props) {
  const t = useTranslations('admin.onboarding');
  const tCommon = useTranslations('common');
  const tErr = useTranslations();
  const client = useApiClient();
  const searchMut = useSearchStaff(client);
  const initiateMut = useInitiateOnboarding(client);
  const panchayatsQuery = useAdminPanchayats(client);

  const isRep = role === 'REPRESENTATIVE';

  const [step, setStep] = React.useState<'form' | 'review'>('form');
  const [phone, setPhone] = React.useState('');
  const [found, setFound] = React.useState<StaffUserDTO | null>(null);
  const [searched, setSearched] = React.useState(false);
  const [panchayatId, setPanchayatId] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const wardsQuery = useAdminWards(client, isRep ? panchayatId : '');

  React.useEffect(() => {
    if (!open) return;
    setStep('form');
    setPhone('');
    setFound(null);
    setSearched(false);
    setPanchayatId('');
    setSelectedIds([]);
    setError(null);
  }, [open]);

  const panchayatOptions = (panchayatsQuery.data ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));

  // The selectable scope rows (active wards of the chosen panchayat, or active panchayats).
  const scopeChoices = isRep
    ? (wardsQuery.data ?? [])
        .filter((w) => w.status === 'active')
        .map((w) => ({ id: w.id, label: `${t('wardShort')} ${w.number} — ${w.name}` }))
    : (panchayatsQuery.data ?? [])
        .filter((p) => p.status === 'active')
        .map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onSearch() {
    setError(null);
    searchMut.mutate(phone.trim(), {
      onSuccess: (user) => {
        setFound(user);
        setSearched(true);
      },
      onError: (err) => setError(tErr(orgErrorKey(err))),
    });
  }

  function onInitiate() {
    setError(null);
    initiateMut.mutate(
      {
        phone: phone.trim(),
        role,
        userId: found?.id,
        wardIds: isRep ? selectedIds : undefined,
        panchayatIds: isRep ? undefined : selectedIds,
      },
      { onSuccess: onInitiated, onError: (err) => setError(tErr(orgErrorKey(err))) },
    );
  }

  const phoneValid = /^\+91[6-9]\d{9}$/.test(phone.trim());
  const canReview = phoneValid && searched && selectedIds.length > 0;
  const selectedLabels = scopeChoices.filter((c) => selectedIds.includes(c.id)).map((c) => c.label);

  return (
    <Modal open={open} onClose={onClose} title={t(isRep ? 'titleRep' : 'titleCoord')} data-testid="onboarding-wizard">
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="error" data-testid="onboarding-wizard-error">
            {error}
          </Alert>
        )}

        {step === 'form' && (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={t('phoneLabel')}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setSearched(false);
                    setFound(null);
                  }}
                  placeholder="+91XXXXXXXXXX"
                  data-testid="onboarding-phone-input"
                />
              </div>
              <Button
                type="button"
                onClick={onSearch}
                loading={searchMut.isPending}
                disabled={!phoneValid}
                data-testid="onboarding-search-button"
              >
                {t('search')}
              </Button>
            </div>

            {searched && (
              <Alert variant={found ? 'success' : 'warning'} data-testid="onboarding-search-result">
                {found
                  ? t('existingUser', { name: found.fullName ?? found.phone })
                  : t('newAccountNotice')}
              </Alert>
            )}

            {isRep && (
              <Select
                label={t('panchayatSelectLabel')}
                value={panchayatId}
                onChange={(v) => {
                  setPanchayatId(v);
                  setSelectedIds([]);
                }}
                options={panchayatOptions}
                placeholder={t('panchayatSelectPlaceholder')}
                data-testid="onboarding-panchayat-select"
              />
            )}

            {(!isRep || panchayatId) && (
              <fieldset className="flex flex-col gap-2" data-testid="onboarding-scope-list">
                <legend className="text-sm font-medium text-neutral-600">
                  {t(isRep ? 'wardsLegend' : 'panchayatsLegend')}
                </legend>
                {scopeChoices.length === 0 ? (
                  <p className="text-sm text-neutral-500">{t('noActiveScopes')}</p>
                ) : (
                  scopeChoices.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-neutral-800">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggle(c.id)}
                        data-testid="onboarding-scope-checkbox"
                        className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                      />
                      {c.label}
                    </label>
                  ))
                )}
              </fieldset>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => setStep('review')}
                disabled={!canReview}
                data-testid="onboarding-review-button"
              >
                {t('reviewNext')}
              </Button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <dl className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-sm" data-testid="onboarding-review">
              <Row label={t('phoneLabel')} value={phone.trim()} />
              <Row label={t('roleLabel')} value={t(isRep ? 'roleRep' : 'roleCoord')} />
              <Row label={t('accountLabel')} value={found ? t('accountExisting') : t('accountNew')} />
              <div className="flex flex-col gap-1">
                <dt className="text-neutral-500">{t(isRep ? 'wardsLegend' : 'panchayatsLegend')}</dt>
                <dd className="flex flex-col gap-0.5">
                  {selectedLabels.map((l) => (
                    <span key={l} className="text-neutral-900">
                      {l}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-neutral-500">{t('otpNotice')}</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep('form')} disabled={initiateMut.isPending}>
                {tCommon('back')}
              </Button>
              <Button
                type="button"
                onClick={onInitiate}
                loading={initiateMut.isPending}
                data-testid="onboarding-initiate-submit"
              >
                {t('initiateSubmit')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
