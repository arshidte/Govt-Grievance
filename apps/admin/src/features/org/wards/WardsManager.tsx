'use client';

import { useAdminPanchayats, useAdminWards, useSetWardStatus } from '@pg/api-client';
import type { WardDTO } from '@pg/types';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  Table,
  type TableColumn,
} from '@pg/ui';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ActiveBadge } from '../ActiveBadge';
import { orgErrorKey } from '../orgError';
import { WardFormModal } from './WardFormModal';

/**
 * Admin Wards module. A panchayat must be chosen first (via the selector, or
 * deep-linked with `?panchayatId=` from the panchayats screen); its wards
 * (active + inactive) are then listed with create/edit and
 * deactivate/reactivate (confirmed). Number uniqueness within the panchayat is
 * enforced server-side.
 */
export function WardsManager() {
  const t = useTranslations('admin.wards');
  const tErr = useTranslations();
  const searchParams = useSearchParams();
  const client = useApiClient();
  const panchayatsQuery = useAdminPanchayats(client);

  const [panchayatId, setPanchayatId] = React.useState(searchParams.get('panchayatId') ?? '');
  const wardsQuery = useAdminWards(client, panchayatId);
  const statusMut = useSetWardStatus(client);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WardDTO | null>(null);
  const [confirm, setConfirm] = React.useState<WardDTO | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const panchayatOptions = React.useMemo(
    () =>
      (panchayatsQuery.data ?? []).map((p) => ({
        value: p.id,
        label: p.status === 'active' ? `${p.code} — ${p.name}` : `${p.code} — ${p.name} (${t('inactiveSuffix')})`,
      })),
    [panchayatsQuery.data, t],
  );

  const columns: Array<TableColumn<WardDTO>> = [
    { key: 'number', header: t('numberLabel'), render: (w) => <span className="font-medium text-neutral-900">{w.number}</span> },
    {
      key: 'name',
      header: t('nameLabel'),
      render: (w) => (
        <div className="flex flex-col">
          <span className="text-neutral-900">{w.name}</span>
          <span className="text-xs text-neutral-500">{w.nameMl}</span>
        </div>
      ),
    },
    { key: 'status', header: t('statusLabel'), render: (w) => <ActiveBadge active={w.status === 'active'} /> },
    {
      key: 'actions',
      header: t('actionsLabel'),
      render: (w) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(w);
              setFormOpen(true);
            }}
            data-testid="ward-edit"
          >
            {t('edit')}
          </Button>
          <Button
            variant={w.status === 'active' ? 'destructive' : 'secondary'}
            onClick={() => {
              setActionError(null);
              setConfirm(w);
            }}
            data-testid="ward-toggle-status"
          >
            {w.status === 'active' ? t('deactivate') : t('reactivate')}
          </Button>
        </div>
      ),
    },
  ];

  function confirmToggle() {
    if (!confirm) return;
    statusMut.mutate(
      { wardId: confirm.id, active: confirm.status !== 'active' },
      { onSuccess: () => setConfirm(null), onError: (err) => setActionError(tErr(orgErrorKey(err))) },
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="wards-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          panchayatId ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              data-testid="ward-create-button"
            >
              {t('createSubmit')}
            </Button>
          ) : undefined
        }
      />

      <div className="max-w-md">
        <Select
          label={t('panchayatSelectLabel')}
          value={panchayatId}
          onChange={setPanchayatId}
          options={panchayatOptions}
          placeholder={t('panchayatSelectPlaceholder')}
          data-testid="ward-panchayat-select"
        />
      </div>

      {!panchayatId ? (
        <EmptyState title={t('choosePanchayatTitle')} description={t('choosePanchayatDescription')} data-testid="wards-choose-panchayat" />
      ) : wardsQuery.isLoading ? (
        <LoadingState label={t('title')} data-testid="wards-loading" />
      ) : wardsQuery.isError ? (
        <ErrorState title={tErr('errors.generic')} data-testid="wards-error" />
      ) : (wardsQuery.data ?? []).length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} data-testid="wards-empty" />
      ) : (
        <Table<WardDTO>
          columns={columns}
          rows={wardsQuery.data ?? []}
          getRowKey={(w) => w.id}
          data-testid="wards-table"
        />
      )}

      {panchayatId && (
        <WardFormModal
          open={formOpen}
          panchayatId={panchayatId}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void wardsQuery.refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.status === 'active' ? t('deactivateConfirmTitle') : t('reactivateConfirmTitle')}
        message={
          actionError ??
          (confirm?.status === 'active'
            ? t('deactivateConfirmMessage', { number: confirm?.number ?? 0 })
            : t('reactivateConfirmMessage', { number: confirm?.number ?? 0 }))
        }
        confirmLabel={confirm?.status === 'active' ? t('deactivate') : t('reactivate')}
        destructive={confirm?.status === 'active'}
        loading={statusMut.isPending}
        onConfirm={confirmToggle}
        onCancel={() => setConfirm(null)}
        data-testid="ward-confirm"
      />
    </div>
  );
}
