import { describe, it, expect } from 'vitest';
import { requestOtpSchema, verifyOtpSchema, phoneSchema } from './index';

describe('auth schemas', () => {
  it('accepts a valid Indian E.164 phone', () => {
    expect(phoneSchema.safeParse('+919876543210').success).toBe(true);
  });
  it('rejects a non-E.164 phone', () => {
    expect(phoneSchema.safeParse('9876543210').success).toBe(false);
  });
  it('verifyOtp requires a 6-digit code', () => {
    expect(verifyOtpSchema.safeParse({ phone: '+919876543210', code: '123' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ phone: '+919876543210', code: '123456' }).success).toBe(true);
  });
  it('requestOtp requires phone only', () => {
    expect(requestOtpSchema.safeParse({ phone: '+919876543210' }).success).toBe(true);
  });
});
