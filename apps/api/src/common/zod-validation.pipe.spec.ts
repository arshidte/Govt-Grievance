import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { ApiError } from './api-error';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'invalid_phone');
  const requestOtpSchema = z.object({ phone: phoneSchema });

  it('passes valid input through unchanged', () => {
    const pipe = new ZodValidationPipe(requestOtpSchema);

    const result = pipe.transform({ phone: '+919876543210' }, {} as never);

    expect(result).toEqual({ phone: '+919876543210' });
  });

  it('throws ApiError with 422 and the first issue message as messageKey on invalid input', () => {
    const pipe = new ZodValidationPipe(requestOtpSchema);

    expect(() => pipe.transform({ phone: 'not-a-phone' }, {} as never)).toThrow(ApiError);

    try {
      pipe.transform({ phone: 'not-a-phone' }, {} as never);
      throw new Error('expected pipe.transform to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiError = err as ApiError;
      expect(apiError.status).toBe(422);
      expect(apiError.code).toBe('validation');
      expect(apiError.messageKey).toBe('invalid_phone');
    }
  });

  it('derives the messageKey from the first failing field when multiple fields are invalid', () => {
    const verifyOtpSchema = z.object({
      phone: phoneSchema,
      code: z.string().regex(/^\d{6}$/, 'invalid_code'),
    });
    const pipe = new ZodValidationPipe(verifyOtpSchema);

    try {
      pipe.transform({ phone: 'bad', code: 'bad' }, {} as never);
      throw new Error('expected pipe.transform to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).messageKey).toBe('invalid_phone');
    }
  });
});
