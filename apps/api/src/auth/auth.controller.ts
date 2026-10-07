import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { requestOtpSchema, verifyOtpSchema, type MeResponse } from '@pg/types';
import type { Request, Response } from 'express';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { buildClearSessionCookie, buildSessionCookie, SESSION_COOKIE_NAME } from './cookie.util';
import { CurrentUser } from './current-user.decorator';
import { OtpService } from './otp.service';
import { SessionService, type SessionUser } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
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
    await this.otp.verify(body.phone, body.code);

    const user = await this.auth.findOrCreateCitizenByPhone(body.phone);

    const { token } = await this.sessions.create(user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
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
      await this.sessions.revoke(token);
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
