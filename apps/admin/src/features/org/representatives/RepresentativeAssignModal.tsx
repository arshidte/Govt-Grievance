'use client';

import {
  useAdminPanchayats,
  useAdminWards,
  useAssignRepresentative,
  useSearchStaff,
} from '@pg/api-client';
import type { StaffUserDTO } from '@pg/types';
import { Alert, Button, Input, Select } from '@pg/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { Modal } from '../../../components/Modal';
import { orgErrorKey } from '../orgError';

interface Props {
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}

/**
 * Assign an existing user as a representative of a ward. Flow: search a user
 * by phone → choose a panchayat → choose one of its ACTIVE wards → assign.
 * Only existing users can be assigned (no onboarding flow in this milestone).
 */
export function RepresentativeAssignModal({ open, onClose, onAssigned }: Props) {
  const t = useTranslations('admin.representatives');
  const tCommon = useTranslations('common');
  const tErr = useTranslations();
  const client = useApiClient();
  const searchMut = useSearchStaff(client);
  const assignMut = useAssignRepresentative(client);
  const panchayatsQuery = useAdminPanchayats(client);

  const [phone, setPhone] = React.useState('');
  const [found, setFound] = React.useState<StaffUserDTO | null>(null);
  const [searched, setSearched] = React.useState(false);
  const [panchayatId, setPanchayatId] = React.useState('');
  const [wardId, setWardId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const wardsQuery = useAdminWards(client, panchayatId);

  React.useEffect(() => {
    if (!open) return;
    setPhone('');
    setFound(null);
    setSearched(false);
    setPanchayatId('');
    setWardId('');
    setError(null);
  }, [open]);

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

  function onAssign() {
    if (!found || !wardId) return;
    setError(null);
    assignMut.mutate(
      { userId: found.id, wardId },
      { onSuccess: onAssigned, onError: (err) => setError(tErr(orgErrorKey(err))) },
    );
  }

  const panchayatOptions = (panchayatsQuery.data ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const wardOptions = (wardsQuery.data ?? [])
    .filter((w) => w.status === 'active')
    .map((w) => ({ value: w.id, label: `${t('wardShort')} ${w.number} — ${w.name}` }));

  return (
    <Modal open={open} onClose={onClose} title={t('assignTitle')} data-testid="representative-assign-modal">
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="error" data-testid="representative-assign-error">
            {error}
          </Alert>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label={t('phoneLabel')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91XXXXXXXXXX"
              data-testid="representative-phone-input"
            />
          </div>
          <Button type="button" onClick={onSearch} loading={searchMut.isPending} data-testid="representative-search-button">
            {t('search')}
          </Button>
        </div>

        {searched && !found && (
          <Alert variant="warning" data-testid="representative-not-found">
            {t('userNotFound')}
          </Alert>
        )}

        {found && (
          <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4" data-testid="representative-found">
            <div className="text-sm">
              <span className="font-medium text-neutral-900">{found.fullName ?? t('unnamedUser')}</span>
              <span className="text-neutral-500"> · {found.phone}</span>
            </div>
            <Select
              label={t('panchayatSelectLabel')}
              value={panchayatId}
              onChange={(v) => {
                setPanchayatId(v);
                setWardId('');
              }}
              options={panchayatOptions}
              placeholder={t('panchayatSelectPlaceholder')}
              data-testid="representative-panchayat-select"
            />
            {panchayatId && (
              <Select
                label={t('wardSelectLabel')}
                value={wardId}
                onChange={setWardId}
                options={wardOptions}
                placeholder={t('wardSelectPlaceholder')}
                data-testid="representative-ward-select"
              />
            )}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={assignMut.isPending}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onAssign}
            loading={assignMut.isPending}
            disabled={!found || !wardId}
            data-testid="representative-assign-submit"
          >
            {t('assignSubmit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
