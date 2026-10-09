import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { requestOtpSchema, verifyOtpSchema, type MeResponse } from '@pg/types';
import type { Request, Response } from 'express';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { buildClearSessionCookie, buildSessionCookie, SESSION_COOKIE_NAME } from './cookie.util';
import { CurrentUser } from './current-user.decorator';
import { OtpService } from './otp.service';
import { SessionService, type SessionUser } from './session.service';

/**
 * Masks `phone` to its last 4 digits for audit metadata (e.g.
 * `+919876543210` -> `*********3210`). GLOBAL CONSTRAINT: audit metadata
 * must never contain a plaintext phone number or OTP code — this is the
 * only form of `phone` that may be recorded.
 */
function maskPhone(phone: string): string {
  const visible = phone.slice(-4);
  return '*'.repeat(Math.max(phone.length - visible.length, 0)) + visible;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issues (and SMS's) an OTP challenge for `phone`. Always returns the same
   * neutral 202 body regardless of whether `phone` has an account —
   * `OtpService.request` itself never looks up account existence, so there
   * is nothing here to leak either. Rate limiting is enforced inside
   * `OtpService.request` (throws `ApiError('rate_limited', 429, ...)`,
   * handled uniformly by the global exception filter).
   */
  @Post('request-otp')
  @HttpCode(202)
  async requestOtp(
    @Body(new ZodValidationPipe(requestOtpSchema)) body: { phone: string },
  ): Promise<{ ok: true }> {
    await this.otp.request(body.phone);

    await this.audit.record({
      action: 'otp.requested',
      entityType: 'User',
      metadata: { phoneMasked: maskPhone(body.phone) },
    });

    return { ok: true };
  }

  /**
   * Verifies the OTP code for `phone`. On success: resolves/creates the
   * `User` (new phones get a citizen-only identity — see
   * `AuthService.findOrCreateCitizenByPhone`), opens a new session recording
   * the caller's IP/user-agent, sets the session cookie on the response, and
   * returns the `MeResponse`. `OtpService.verify` throws a uniform 401 for
   * every failure mode (wrong code, expired, consumed, exhausted) before any
   * of this runs, so a failed verification never creates a user, a session,
   * or a cookie.
   */
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: { phone: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const phoneMasked = maskPhone(body.phone);

    try {
      await this.otp.verify(body.phone, body.code);
    } catch (err) {
      if (err instanceof ApiError) {
        // Audit the failure, then re-throw the SAME uniform error unchanged
        // (see OtpService.verify doc) — the non-disclosure contract must
        // not be affected by auditing.
        await this.audit.record({
          action: 'otp.failed',
          entityType: 'User',
          metadata: { phoneMasked },
          ip: req.ip,
        });
      }
      throw err;
    }

    const user = await this.auth.findOrCreateCitizenByPhone(body.phone);

    await this.audit.record({
      actorUserId: user.id,
      action: 'otp.verified',
      entityType: 'User',
      entityId: user.id,
      metadata: { phoneMasked },
      ip: req.ip,
    });

    const { token } = await this.sessions.create(user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'session.created',
      entityType: 'User',
      entityId: user.id,
      metadata: { phoneMasked },
      ip: req.ip,
    });

    const cookie = buildSessionCookie(token);
    res.cookie(cookie.name, cookie.value, cookie.options);

    return this.auth.toMeResponse(user);
  }

  /**
   * Revokes the current session (if any) and clears the cookie. Reads the
   * cookie directly rather than going through `AuthGuard` so a request with
   * a missing/already-invalid cookie still clears client-side state and
   * returns 200 instead of 401 — logging out is idempotent by design
   * (mirrors `SessionService.revoke`'s own idempotence).
   */
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    if (token) {
      // Resolve the session's user BEFORE revoking, both to attribute the
      // audit row (actorUserId) and to know whether there was actually a
      // live session to revoke. If the token is already invalid/expired,
      // `validate` throws the uniform unauthenticated ApiError; swallow it
      // here (logout stays idempotent/always-200 regardless of token
      // validity) and skip the audit row — nothing was actually revoked.
      const actorUserId = await this.sessions
        .validate(token)
        .then((user) => user.id)
        .catch(() => undefined);

      await this.sessions.revoke(token);

      if (actorUserId) {
        await this.audit.record({
          actorUserId,
          action: 'session.revoked',
          entityType: 'User',
          entityId: actorUserId,
          ip: req.ip,
        });
      }
    }

    const cleared = buildClearSessionCookie();
    res.cookie(cleared.name, cleared.value, cleared.options);

    return { ok: true };
  }

  /** Returns the current session's user as a `MeResponse`. Requires `AuthGuard`. */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: SessionUser): Promise<MeResponse> {
    return this.auth.toMeResponse(user);
  }
}
