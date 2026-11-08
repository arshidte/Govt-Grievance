'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Alert, Button, Card, Input } from '@pg/ui';
import { CheckCircle2, ChevronDown, ImagePlus } from 'lucide-react';

import { useApiClient } from '../auth/api-client';

/** Client-side pre-check only; the server does the authoritative magic-byte sniff + size enforcement. */
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Shared field recipe for the wizard's dependent native `<select>`s. Matched
 * to the `@pg/ui` `Input`/`Select` recipe (white surface, hairline
 * neutral-200 border, `rounded-lg`, brand focus ring, 44px min target) so the
 * form reads as one consistent set of fields. We keep these as plain native
 * `<select>` elements wired via react-hook-form `register` (NOT the controlled
 * `@pg/ui` `Select`, which would force a `Controller` refactor) — only the
 * classes change. `appearance-none` hides the native arrow; `pr-9` leaves room
 * for the decorative ChevronDown overlay (see `SelectField`).
 */
const SELECT_FIELD_CLASS = [
  'min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-9 text-sm text-neutral-900',
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ');

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
      // Calm, reassuring confirmation: a centered success chip + heading, then
      // the reference number called out in a tinted panel so it's the clear
      // focal point. Behavior unchanged — same success condition, same
      // reference-number + photo-warning surfaces, same testids.
      <Card className="flex flex-col items-center gap-5 text-center" data-testid="report-confirmation">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-status-resolved">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>

        <div className="flex flex-col gap-1.5">
          {/* The success Alert carries the role="status" announcement; the
              heading below is the visible, prominent confirmation copy. */}
          <Alert variant="success" title={t('report.confirmTitle')} className="justify-center text-left" />
          <p className="text-sm text-neutral-700">{t('report.confirmDescription')}</p>
        </div>

        <div className="flex w-full flex-col items-center gap-1 rounded-xl border border-primary-200 bg-primary-50 px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-700">
            {t('report.referenceNumberLabel')}
          </p>
          <p
            className="text-2xl font-semibold tracking-tight text-neutral-900"
            data-testid="reference-number"
          >
            {created.referenceNo}
          </p>
        </div>

        <p className="text-sm text-neutral-500">{t('report.confirmNextSteps')}</p>

        {photoWarning && (
          <Alert variant="warning" title={t('report.photoUploadFailed')} className="w-full text-left" />
        )}
      </Card>
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
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate data-testid="report-wizard">
      {/* Section 1 — Location: category → subcategory (dependent, client-side
          filter) + panchayat → ward (dependent, query gated on panchayat).
          Grouped into one Card so the "where" context reads as a unit. */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral-900">{t('report.sectionLocation')}</h2>
          <p className="text-sm text-neutral-500">{t('report.sectionLocationHint')}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoryId" className="text-sm font-medium text-neutral-600">
            {t('report.categoryLabel')}
          </label>
          <SelectField>
            <select
              id="categoryId"
              className={SELECT_FIELD_CLASS}
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={errors.categoryId ? 'categoryId-error' : undefined}
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
          </SelectField>
          {errors.categoryId && (
            <p id="categoryId-error" role="alert" className="text-sm text-status-escalated">
              {t('report.categoryRequired')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="subcategoryId" className="text-sm font-medium text-neutral-600">
            {t('report.subcategoryLabel')}
          </label>
          <SelectField>
            <select
              id="subcategoryId"
              className={SELECT_FIELD_CLASS}
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
          </SelectField>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="panchayatId" className="text-sm font-medium text-neutral-600">
            {t('report.panchayatLabel')}
          </label>
          <SelectField>
            <select
              id="panchayatId"
              className={SELECT_FIELD_CLASS}
              aria-invalid={errors.panchayatId ? true : undefined}
              aria-describedby={errors.panchayatId ? 'panchayatId-error' : undefined}
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
          </SelectField>
          {errors.panchayatId && (
            <p id="panchayatId-error" role="alert" className="text-sm text-status-escalated">
              {t('report.panchayatRequired')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wardId" className="text-sm font-medium text-neutral-600">
            {t('report.wardLabel')}
          </label>
          <SelectField>
            <select
              id="wardId"
              className={SELECT_FIELD_CLASS}
              aria-invalid={errors.wardId ? true : undefined}
              aria-describedby={errors.wardId ? 'wardId-error' : undefined}
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
          </SelectField>
          {errors.wardId && (
            <p id="wardId-error" role="alert" className="text-sm text-status-escalated">
              {t('report.wardRequired')}
            </p>
          )}
        </div>
      </Card>

      {/* Section 2 — Details: title + description + the optional photo. */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral-900">{t('report.sectionDetails')}</h2>
          <p className="text-sm text-neutral-500">{t('report.sectionDetailsHint')}</p>
        </div>

        <Input
          label={t('report.titleLabel')}
          error={errors.title?.message ? t('report.titleRequired') : undefined}
          required
          data-testid="title-input"
          {...register('title')}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-neutral-600">
            {t('report.descriptionLabel')}
          </label>
          <textarea
            id="description"
            rows={5}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'description-error' : undefined}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            data-testid="description-input"
            {...register('description')}
          />
          {errors.description && (
            <p id="description-error" role="alert" className="text-sm text-status-escalated">
              {t('report.descriptionRequired')}
            </p>
          )}
        </div>

        {/* Optional photo — a visible attachment field with its requirements
            shown. The native file input gets a restyled custom-button recipe
            via Tailwind's `file:` variant; the hint spells out accepted types. */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="photo" className="text-sm font-medium text-neutral-600">
            {t('report.photoLabel')}
          </label>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-400 ring-1 ring-neutral-200">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <input
              id="photo"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="min-w-0 flex-1 text-sm text-neutral-700 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-neutral-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-900 hover:file:bg-neutral-50"
              data-testid="photo-input"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-xs text-neutral-500">{t('report.photoHint')}</p>
        </div>
      </Card>

      {/* Review step: a lightweight summary of the entered title before the
          explicit submit action. Rendered as a tinted panel inside its own
          Card for a clear "check this" cue. */}
      <Card className="flex flex-col gap-2" data-testid="review-step">
        <p className="text-sm font-semibold text-neutral-900">{t('report.reviewHeading')}</p>
        <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
          {watch('title') || t('report.reviewEmpty')}
        </p>
      </Card>

      {createErrorMessage && <Alert variant="error" title={createErrorMessage} />}

      <Button type="submit" loading={createIssue.isPending} data-testid="submit-button">
        {t('report.submitCta')}
      </Button>
    </form>
  );
}

/**
 * Presentational wrapper that overlays a decorative ChevronDown on a native
 * `<select>` (whose own arrow is hidden via `appearance-none` in
 * `SELECT_FIELD_CLASS`). The native control still owns all interaction; this
 * only mirrors the `@pg/ui` Select's chevron affordance for the wizard's
 * register-wired selects. No logic — just the icon overlay.
 */
function SelectField({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400"
      >
        <ChevronDown className="h-4 w-4" />
      </span>
    </div>
  );
}
