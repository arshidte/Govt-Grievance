import { z } from 'zod';
export const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'invalid_phone');
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'invalid_code');
export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
