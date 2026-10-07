import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

import { ApiError } from './api-error';

/**
 * Validates a request payload against a Zod schema. On failure, throws an
 * `ApiError('validation', 422, messageKey)` where `messageKey` is the
 * message of the first Zod issue — this lets field-level codes (e.g.
 * `invalid_phone`, `invalid_code`) flow straight through to the frontend's
 * i18n lookup. On success, returns the schema's parsed (and possibly
 * coerced) value.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const messageKey = firstIssue?.message ?? 'validation_failed';
      throw new ApiError('validation', 422, messageKey);
    }

    return result.data;
  }
}
