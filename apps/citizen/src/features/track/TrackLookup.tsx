'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Alert, Button, Input } from '@pg/ui';

/** Loose shape check only — issue data/real lookup is M2; this never calls an API. */
const referenceSchema = z.object({
  reference: z.string().min(1),
});
type ReferenceInput = z.infer<typeof referenceSchema>;

/**
 * Public grievance-tracking lookup. Issue data (and therefore any real
 * lookup) is M2 scope — submitting here NEVER calls an API and NEVER
 * renders citizen/issue personal data. Its only behavior today is to
 * acknowledge the reference was entered and point the visitor at signing
 * in, which is where any real detail (status, description, citizen info)
 * would eventually be shown — behind auth. This keeps the public `/track`
 * route PII-safe by construction: there is no code path here that could
 * fetch or render someone else's grievance details without a session.
 */
export function TrackLookup() {
  const t = useTranslations('track');
  const locale = useLocale();
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReferenceInput>({
    resolver: zodResolver(referenceSchema),
    defaultValues: { reference: '' },
  });

  const onSubmit = handleSubmit((data) => {
    setSubmittedReference(data.reference);
  });

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label={t('referenceLabel')}
          placeholder={t('referencePlaceholder')}
          error={errors.reference ? t('invalidReference') : undefined}
          required
          data-testid="track-reference-input"
          {...register('reference')}
        />

        <Button type="submit" data-testid="track-lookup-submit">
          {t('lookupCta')}
        </Button>
      </form>

      {submittedReference && (
        <Alert
          variant="info"
          title={t('signInForDetails')}
          data-testid="track-sign-in-prompt"
        />
      )}

      {submittedReference && (
        <Button asChild variant="secondary" data-testid="track-sign-in-cta">
          <Link href={`/${locale}/login`}>{t('signInCta')}</Link>
        </Button>
      )}
    </div>
  );
}
