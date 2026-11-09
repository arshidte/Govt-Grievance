'use client';

import { useAdminPanchayats, useSetPanchayatStatus } from '@pg/api-client';
import type { PanchayatDetailDTO, PanchayatDTO } from '@pg/types';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SearchInput,
  Table,
  type TableColumn,
} from '@pg/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ActiveBadge } from '../ActiveBadge';
import { orgErrorKey } from '../orgError';
import { PanchayatFormModal } from './PanchayatFormModal';

/**
 * Admin Panchayats module: searchable list (active + inactive), create/edit,
 * and deactivate/reactivate with confirmation. "Wards" deep-links to the ward
 * manager scoped to that panchayat. All controls are admin-only — the server
 * enforces it regardless of what this UI shows.
 */
export function PanchayatsManager() {
  const t = useTranslations('admin.panchayats');
  const tErr = useTranslations();
  const locale = useLocale();
  const client = useApiClient();
  const query = useAdminPanchayats(client);
  const statusMut = useSetPanchayatStatus(client);

  const [search, setSearch] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PanchayatDetailDTO | null>(null);
  const [confirm, setConfirm] = React.useState<PanchayatDTO | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const rows = React.useMemo(() => {
    const all = query.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [query.data, search]);

  const columns: Array<TableColumn<PanchayatDTO>> = [
    { key: 'code', header: t('codeLabel'), render: (p) => <span className="font-medium text-neutral-900">{p.code}</span> },
    {
      key: 'name',
      header: t('nameLabel'),
      render: (p) => (
        <div className="flex flex-col">
          <span className="text-neutral-900">{p.name}</span>
          <span className="text-xs text-neutral-500">{p.nameMl}</span>
        </div>
      ),
    },
    { key: 'status', header: t('statusLabel'), render: (p) => <ActiveBadge active={p.status === 'active'} /> },
    {
      key: 'actions',
      header: t('actionsLabel'),
      render: (p) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void openEdit(p)} data-testid="panchayat-edit">
            {t('edit')}
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/${locale}/wards?panchayatId=${encodeURIComponent(p.id)}`} data-testid="panchayat-wards-link">
              {t('manageWards')}
            </Link>
          </Button>
          <Button
            variant={p.status === 'active' ? 'destructive' : 'secondary'}
            onClick={() => {
              setActionError(null);
              setConfirm(p);
            }}
            data-testid="panchayat-toggle-status"
          >
            {p.status === 'active' ? t('deactivate') : t('reactivate')}
          </Button>
        </div>
      ),
    },
  ];

  /** Loads full detail (for contact fields) before opening the edit form. */
  async function openEdit(p: PanchayatDTO) {
    const detail = await client.getPanchayat(p.id);
    setEditing(detail);
    setFormOpen(true);
  }

  function confirmToggle() {
    if (!confirm) return;
    const target = confirm;
    statusMut.mutate(
      { id: target.id, active: target.status !== 'active' },
      {
        onSuccess: () => setConfirm(null),
        onError: (err) => setActionError(tErr(orgErrorKey(err))),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="panchayats-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="panchayat-create-button"
          >
            {t('createSubmit')}
          </Button>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        data-testid="panchayat-search"
      />

      {query.isLoading ? (
        <LoadingState label={t('title')} data-testid="panchayats-loading" />
      ) : query.isError ? (
        <ErrorState title={tErr('errors.generic')} data-testid="panchayats-error" />
      ) : rows.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} data-testid="panchayats-empty" />
      ) : (
        <Table<PanchayatDTO>
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          data-testid="panchayats-table"
        />
      )}

      <PanchayatFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void query.refetch();
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.status === 'active' ? t('deactivateConfirmTitle') : t('reactivateConfirmTitle')}
        message={
          actionError ??
          (confirm?.status === 'active'
            ? t('deactivateConfirmMessage', { name: confirm?.name ?? '' })
            : t('reactivateConfirmMessage', { name: confirm?.name ?? '' }))
        }
        confirmLabel={confirm?.status === 'active' ? t('deactivate') : t('reactivate')}
        destructive={confirm?.status === 'active'}
        loading={statusMut.isPending}
        onConfirm={confirmToggle}
        onCancel={() => setConfirm(null)}
        data-testid="panchayat-confirm"
      />
    </div>
  );
}
