'use client';

import { useCreateWard, useUpdateWard } from '@pg/api-client';
import { createWardSchema, updateWardSchema, type WardDTO } from '@pg/types';
import { Alert, Button, Input } from '@pg/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { Modal } from '../../../components/Modal';
import { orgErrorKey } from '../orgError';

interface WardFormModalProps {
  open: boolean;
  panchayatId: string;
  /** When set, edit this ward; otherwise create a new one under `panchayatId`. */
  editing: WardDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Create / edit a ward (number + bilingual name). Number uniqueness within the panchayat is enforced server-side. */
export function WardFormModal({ open, panchayatId, editing, onClose, onSaved }: WardFormModalProps) {
  const t = useTranslations('admin.wards');
  const tCommon = useTranslations('common');
  const tErr = useTranslations();
  const client = useApiClient();
  const createMut = useCreateWard(client);
  const updateMut = useUpdateWard(client);

  const [number, setNumber] = React.useState('');
  const [name, setName] = React.useState('');
  const [nameMl, setNameMl] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setNumber(editing ? String(editing.number) : '');
    setName(editing?.name ?? '');
    setNameMl(editing?.nameMl ?? '');
    setFieldErrors({});
    setServerError(null);
  }, [open, editing]);

  const pending = createMut.isPending || updateMut.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const schema = editing ? updateWardSchema : createWardSchema;
    const parsed = schema.safeParse({ number: Number(number), name, nameMl });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !(key in out)) out[key] = issue.message;
      }
      return setFieldErrors(out);
    }
    const onErr = (err: unknown) => setServerError(tErr(orgErrorKey(err)));
    if (editing) {
      updateMut.mutate({ wardId: editing.id, input: parsed.data }, { onSuccess: onSaved, onError: onErr });
    } else {
      createMut.mutate({ panchayatId, input: parsed.data }, { onSuccess: onSaved, onError: onErr });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('editTitle') : t('createTitle')} data-testid="ward-form-modal">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {serverError && (
          <Alert variant="error" data-testid="ward-form-error">
            {serverError}
          </Alert>
        )}
        <Input
          label={t('numberLabel')}
          type="number"
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          error={fieldErrors.number}
          data-testid="ward-number-input"
          required
        />
        <Input
          label={t('nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          data-testid="ward-name-input"
          required
        />
        <Input
          label={t('nameMlLabel')}
          value={nameMl}
          onChange={(e) => setNameMl(e.target.value)}
          error={fieldErrors.nameMl}
          data-testid="ward-name-ml-input"
          required
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" loading={pending} data-testid="ward-form-submit">
            {editing ? t('saveChanges') : t('createSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
