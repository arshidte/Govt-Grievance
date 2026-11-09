'use client';

import { useCreatePanchayat, useUpdatePanchayat } from '@pg/api-client';
import { createPanchayatSchema, updatePanchayatSchema, type PanchayatDetailDTO } from '@pg/types';
import { Alert, Button, Input } from '@pg/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';

import { Modal } from '../../../components/Modal';
import { orgErrorKey } from '../orgError';

interface PanchayatFormModalProps {
  open: boolean;
  /** When set, the form edits this panchayat; otherwise it creates a new one. */
  editing: PanchayatDetailDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Create / edit a panchayat. `code` is shown but DISABLED when editing (it is
 * immutable after creation — the update schema doesn't even carry it). Fields
 * are validated client-side with the same Zod schemas the API uses; server
 * errors (e.g. duplicate code) surface in an Alert.
 */
export function PanchayatFormModal({ open, editing, onClose, onSaved }: PanchayatFormModalProps) {
  const t = useTranslations('admin.panchayats');
  const tCommon = useTranslations('common');
  const tErr = useTranslations();
  const client = useApiClient();
  const createMut = useCreatePanchayat(client);
  const updateMut = useUpdatePanchayat(client);

  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [nameMl, setNameMl] = React.useState('');
  const [contactPhone, setContactPhone] = React.useState('');
  const [contactEmail, setContactEmail] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Reset the form whenever it (re)opens for a given target.
  React.useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? '');
    setName(editing?.name ?? '');
    setNameMl(editing?.nameMl ?? '');
    setContactPhone(editing?.contactPhone ?? '');
    setContactEmail(editing?.contactEmail ?? '');
    setFieldErrors({});
    setServerError(null);
  }, [open, editing]);

  const pending = createMut.isPending || updateMut.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (editing) {
      const parsed = updatePanchayatSchema.safeParse({ name, nameMl, contactPhone, contactEmail });
      if (!parsed.success) return setFieldErrors(flatten(parsed.error));
      updateMut.mutate(
        { id: editing.id, input: parsed.data },
        { onSuccess: onSaved, onError: (err) => setServerError(tErr(orgErrorKey(err))) },
      );
    } else {
      const parsed = createPanchayatSchema.safeParse({
        code,
        name,
        nameMl,
        contactPhone,
        contactEmail,
      });
      if (!parsed.success) return setFieldErrors(flatten(parsed.error));
      createMut.mutate(parsed.data, {
        onSuccess: onSaved,
        onError: (err) => setServerError(tErr(orgErrorKey(err))),
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('editTitle') : t('createTitle')}
      data-testid="panchayat-form-modal"
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {serverError && (
          <Alert variant="error" data-testid="panchayat-form-error">
            {serverError}
          </Alert>
        )}
        <Input
          label={t('codeLabel')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={fieldErrors.code}
          disabled={!!editing}
          hint={editing ? t('codeImmutableHint') : undefined}
          data-testid="panchayat-code-input"
          required
        />
        <Input
          label={t('nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          data-testid="panchayat-name-input"
          required
        />
        <Input
          label={t('nameMlLabel')}
          value={nameMl}
          onChange={(e) => setNameMl(e.target.value)}
          error={fieldErrors.nameMl}
          data-testid="panchayat-name-ml-input"
          required
        />
        <Input
          label={t('contactPhoneLabel')}
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          error={fieldErrors.contactPhone}
          data-testid="panchayat-contact-phone-input"
        />
        <Input
          label={t('contactEmailLabel')}
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          error={fieldErrors.contactEmail}
          data-testid="panchayat-contact-email-input"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" loading={pending} data-testid="panchayat-form-submit">
            {editing ? t('saveChanges') : t('createSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Flattens a ZodError into a `{ field: firstMessage }` map for inline display. */
function flatten(error: import('zod').ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) out[key] = issue.message;
  }
  return out;
}
