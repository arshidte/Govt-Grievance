import { z } from 'zod';
export const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'invalid_phone');
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'invalid_code');
export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * MSG91 widget login (replaces the server-generated OTP login). The browser
 * widget sends + verifies the OTP and returns an opaque JWT access token; the
 * client posts ONLY that token to `POST /auth/verify-token`. The server never
 * trusts a client-supplied phone — it derives the verified identifier by
 * validating this token with MSG91 (`verifyAccessToken`). See
 * `apps/api/src/auth/msg91`.
 */
export const verifyTokenSchema = z.object({ accessToken: z.string().min(1, 'invalid_token') });
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
