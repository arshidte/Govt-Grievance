import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { verifyTokenSchema, type MeResponse, type VerifyTokenInput } from '@pg/types';
import type { Request, Response } from 'express';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { maskPhone } from '../common/mask-phone';
import { AUTH_THROTTLE_LIMIT, AUTH_THROTTLE_TTL_MS } from '../common/throttler.config';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { buildClearSessionCookie, buildSessionCookie, SESSION_COOKIE_NAME } from './cookie.util';
import { CurrentUser } from './current-user.decorator';
import { MSG91_VERIFIER, type Msg91Verifier } from './msg91/msg91-verifier.interface';
import { SessionService, type SessionUser } from './session.service';

/**
 * Overrides the globally-registered `default` throttler (see
 * `ThrottlerModule.forRoot` in `app.module.ts`) with a MUCH tighter
 * limit/window for every route on this controller. Auth endpoints
 * (`request-otp`/`verify-otp` especially) are the most attractive target
 * for abuse — OTP flooding, SMS-cost exhaustion, credential/code guessing —
 * so they must throttle harder than the rest of the API (acceptance
 * criterion for Task 15). Values are centralized in
 * `src/common/throttler.config.ts` so they're easy to find and to assert
 * against in `test/throttle.e2e-spec.ts`.
 */
@Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(MSG91_VERIFIER) private readonly verifier: Msg91Verifier,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * MSG91 widget login. The browser widget has already sent + verified the OTP
   * and produced an opaque access token; the client posts ONLY that token. The
   * server validates it with MSG91 (`Msg91Verifier.verifyAccessToken`) and uses
   * the phone MSG91 vouches for — NEVER a client-supplied phone. On success:
   * resolves/creates the `User` (new phones get a citizen-only identity — see
   * `AuthService.findOrCreateCitizenByPhone`), opens a session recording the
   * caller's IP/user-agent, sets the session cookie, and returns `MeResponse`.
   * A rejected token throws a uniform 401 BEFORE any user/session/cookie is
   * created; MSG91 being unreachable surfaces a 503.
   */
  @Post('verify-token')
  @HttpCode(200)
  async verifyToken(
    @Body(new ZodValidationPipe(verifyTokenSchema)) body: VerifyTokenInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    let phone: string;
    try {
      ({ phone } = await this.verifier.verifyAccessToken(body.accessToken));
    } catch (err) {
      if (err instanceof ApiError) {
        // Audit the failed verification (no verified phone to attribute/mask),
        // then re-throw the SAME uniform error unchanged — the non-disclosure
        // contract must not be affected by auditing.
        await this.audit.record({ action: 'otp.failed', entityType: 'User', ip: req.ip });
      }
      throw err;
    }

    const phoneMasked = maskPhone(phone);
    const user = await this.auth.findOrCreateCitizenByPhone(phone);

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
