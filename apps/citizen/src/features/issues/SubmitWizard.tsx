'use client';

import { useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { createIssueSchema, type CreateIssueInput, type IssueDetailDTO } from '@pg/types';
import {
  ApiClientError,
  useCategories,
  useCreateIssue,
  usePanchayats,
  useUploadAttachment,
  useWards,
} from '@pg/api-client';
import { Alert, Button, Input } from '@pg/ui';

import { useApiClient } from '../auth/api-client';

/** Client-side pre-check only; the server does the authoritative magic-byte sniff + size enforcement. */
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Grievance submission wizard (Phase G, spec §12). A clearly-sectioned
 * single form — category→subcategory (dependent), panchayat→ward
 * (dependent), title/description, an OPTIONAL photo — followed by a
 * reference-number confirmation once the issue is created.
 *
 * Validation REUSES `createIssueSchema` from `@pg/types` directly via
 * `zodResolver` (we never redefine the shape): the client mirror blocks an
 * invalid submit (e.g. empty title) and surfaces a translated error, while
 * the server remains authoritative.
 *
 * Idempotency: ONE `crypto.randomUUID()` is generated per wizard INSTANCE
 * (a lazy `useRef`) and passed to the create mutation on every attempt, so a
 * double-submit / retry can never create a duplicate issue.
 *
 * Submit flow: on a valid submit we `useCreateIssue` with the chosen values
 * + the idempotency key; on success we get back an `IssueDetailDTO`
 * (`referenceNo`, `id`). If an optional photo was selected we then upload it
 * BEST-EFFORT to the new issue id — a failed photo upload does NOT hide the
 * reference-number confirmation (the issue exists); it just surfaces a
 * non-fatal warning.
 */
export function SubmitWizard() {
  const t = useTranslations();
  const locale = useLocale();
  const client = useApiClient();

  const categories = useCategories(client);
  const panchayats = usePanchayats(client);

  const createIssue = useCreateIssue(client);
  const uploadAttachment = useUploadAttachment(client);

  // One idempotency key per wizard instance — initialized ONCE (lazy ref), so
  // every submit attempt from this mounted wizard reuses the same key.
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) {
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  // Locale-aware display name helper for the org/catalog selects.
  const displayName = (item: { name: string; nameMl: string }): string =>
    locale === 'ml' ? item.nameMl : item.name;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateIssueInput>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: {
      title: '',
      description: '',
      categoryId: '',
      subcategoryId: undefined,
      panchayatId: '',
      wardId: '',
    },
  });

  // Dependent-select drivers: we WATCH the selected category/panchayat so the
  // subcategory options filter client-side and the ward query enables.
  const selectedCategoryId = watch('categoryId');
  const selectedPanchayatId = watch('panchayatId');

  // Ward options come from a DEPENDENT query, gated on a chosen panchayat
  // (the hook's `enabled: !!panchayatId` keeps it idle until then).
  const wards = useWards(client, selectedPanchayatId);

  // Subcategories are nested on the chosen category — filter client-side (no
  // refetch). Empty when no category is selected yet.
  const subcategories = useMemo(() => {
    const category = categories.data?.find((c) => c.id === selectedCategoryId);
    return category?.subcategories ?? [];
  }, [categories.data, selectedCategoryId]);

  // The optional photo lives in local state (NOT in the zod form — the schema
  // has no file field; the server validates the upload separately).
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoWarning, setPhotoWarning] = useState(false);

  const onSubmit = handleSubmit((data) => {
    // Normalize an empty subcategory selection to `undefined` (the schema's
    // `subcategoryId` is optional and must be a non-empty string if present).
    const input: CreateIssueInput = {
      ...data,
      subcategoryId: data.subcategoryId ? data.subcategoryId : undefined,
    };

    setPhotoWarning(false);

    createIssue.mutate(
      { input, idempotencyKey: idempotencyKeyRef.current ?? undefined },
      {
        onSuccess: (issue: IssueDetailDTO) => {
          // Best-effort optional photo upload to the freshly-created issue.
          // A failure here must NOT block the reference-number confirmation —
          // the issue already exists — so we only flag a non-fatal warning.
          if (photo) {
            uploadAttachment.mutate(
              { issueId: issue.id, file: photo },
              { onError: () => setPhotoWarning(true) },
            );
          }
        },
      },
    );
  });

  // When the create succeeds we have the created issue (with its
  // referenceNo) — render the confirmation step instead of the form.
  if (createIssue.isSuccess && createIssue.data) {
    const created = createIssue.data;
    return (
      <div className="flex flex-col gap-4" data-testid="report-confirmation">
        <Alert variant="success" title={t('report.confirmTitle')} />
        <p className="text-sm text-neutral-700">{t('report.confirmDescription')}</p>
        <p className="text-sm font-medium text-neutral-800">{t('report.referenceNumberLabel')}</p>
        <p className="text-lg font-semibold text-neutral-900" data-testid="reference-number">
          {created.referenceNo}
        </p>
        {photoWarning && <Alert variant="warning" title={t('report.photoUploadFailed')} />}
      </div>
    );
  }

  // Map the create mutation's ApiClientError messageKey through next-intl,
  // falling back to a generic submit-failed string for any non-known key.
  const createErrorMessage = (() => {
    if (!createIssue.isError) return undefined;
    const err = createIssue.error;
    if (err instanceof ApiClientError && err.messageKey) {
      return t.has(err.messageKey) ? t(err.messageKey) : t('report.submitFailed');
    }
    return t('report.submitFailed');
  })();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate data-testid="report-wizard">
      {/* Category → subcategory (dependent, client-side filter). */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="categoryId" className="text-sm font-medium text-neutral-800">
          {t('report.categoryLabel')}
        </label>
        <select
          id="categoryId"
          className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900"
          data-testid="category-select"
          {...register('categoryId', {
            // Changing the category invalidates any previously-chosen
            // subcategory (it belonged to the old category).
            onChange: () => setValue('subcategoryId', undefined),
          })}
        >
          <option value="">{t('report.categoryPlaceholder')}</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {displayName(c)}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="text-sm text-status-escalated">{t('report.categoryRequired')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="subcategoryId" className="text-sm font-medium text-neutral-800">
          {t('report.subcategoryLabel')}
        </label>
        <select
          id="subcategoryId"
          className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900"
          data-testid="subcategory-select"
          disabled={!selectedCategoryId}
          {...register('subcategoryId')}
        >
          <option value="">{t('report.subcategoryPlaceholder')}</option>
          {subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {displayName(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Panchayat → ward (dependent, query gated on panchayat). */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="panchayatId" className="text-sm font-medium text-neutral-800">
          {t('report.panchayatLabel')}
        </label>
        <select
          id="panchayatId"
          className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900"
          data-testid="panchayat-select"
          {...register('panchayatId', {
            // Changing the panchayat resets the chosen ward — the old ward
            // belonged to a different panchayat and `useWards` refetches.
            onChange: () => setValue('wardId', ''),
          })}
        >
          <option value="">{t('report.panchayatPlaceholder')}</option>
          {panchayats.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {displayName(p)}
            </option>
          ))}
        </select>
        {errors.panchayatId && (
          <p className="text-sm text-status-escalated">{t('report.panchayatRequired')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="wardId" className="text-sm font-medium text-neutral-800">
          {t('report.wardLabel')}
        </label>
        <select
          id="wardId"
          className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900"
          data-testid="ward-select"
          disabled={!selectedPanchayatId}
          {...register('wardId')}
        >
          <option value="">{t('report.wardPlaceholder')}</option>
          {wards.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {displayName(w)}
            </option>
          ))}
        </select>
        {errors.wardId && (
          <p className="text-sm text-status-escalated">{t('report.wardRequired')}</p>
        )}
      </div>

      {/* Title + description. */}
      <Input
        label={t('report.titleLabel')}
        error={errors.title?.message ? t('report.titleRequired') : undefined}
        required
        data-testid="title-input"
        {...register('title')}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-neutral-800">
          {t('report.descriptionLabel')}
        </label>
        <textarea
          id="description"
          rows={5}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          data-testid="description-input"
          {...register('description')}
        />
        {errors.description && (
          <p className="text-sm text-status-escalated">{t('report.descriptionRequired')}</p>
        )}
      </div>

      {/* Optional photo. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="photo" className="text-sm font-medium text-neutral-800">
          {t('report.photoLabel')}
        </label>
        <input
          id="photo"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="text-sm text-neutral-900"
          data-testid="photo-input"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-neutral-500">{t('report.photoHint')}</p>
      </div>

      {/* A single review summary of the entered title before the explicit
          submit action — a lightweight "review step" within the form. */}
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3" data-testid="review-step">
        <p className="text-sm font-medium text-neutral-800">{t('report.reviewHeading')}</p>
        <p className="text-sm text-neutral-600">{watch('title') || t('report.reviewEmpty')}</p>
      </div>

      {createErrorMessage && <Alert variant="error" title={createErrorMessage} />}

      <Button type="submit" loading={createIssue.isPending} data-testid="submit-button">
        {t('report.submitCta')}
      </Button>
    </form>
  );
}
