import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { RoleAssignment, User } from '@prisma/client';

import { ApiError } from '../common/api-error';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** A resolved session's user, with role assignments eagerly loaded. */
export type SessionUser = User & { roleAssignments: RoleAssignment[] };

/** Optional request context recorded on the session for auditing/device UX. */
export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

/**
 * Uniform failure for EVERY validate() rejection (no session found, expired,
 * or revoked). Like OtpService's invalidOtpError, this deliberately does NOT
 * distinguish the cases: a caller must not be able to infer whether a token
 * ever existed, whether it expired vs. was revoked, etc. Never change this to
 * a more "helpful" per-case error without a security review.
 */
function unauthenticatedError(): ApiError {
  return new ApiError('unauthenticated', 401, 'states.forbidden');
}

/**
 * DB-backed, immediately-revocable login sessions.
 *
 * Why DB-backed and not stateless JWT: deactivating a staff member or
 * revoking a device must take effect on the very next request. Each
 * `validate()` reads the session row fresh from Postgres — there is no
 * in-memory cache — so a `revoke()` (or an expiry, or an admin deleting the
 * row) is honoured immediately.
 *
 * Token handling (see Task 10 brief, Review Focus #2):
 * - The token handed to the client is a 256-bit opaque random value
 *   (`crypto.randomBytes(32)`, base64url). It carries no claims.
 * - Only a SHA-256 hash of the token is ever persisted (`tokenHash`). The
 *   raw token exists only in the `create()` return value and in the inbound
 *   cookie on later requests; it is never written to the database or logged.
 *   A single SHA-256 is sufficient here (unlike a low-entropy password or OTP)
 *   because the token is already 256 bits of CSPRNG output — it is not
 *   guessable or brute-forceable, so a slow KDF buys nothing.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministic hash of an opaque session token. Exposed as a static so
   * tests and (later) middleware can derive the stored `tokenHash` without a
   * SessionService instance. SHA-256 is appropriate for a high-entropy token
   * (see class doc); do NOT swap in a salted/per-call hash or lookups break.
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issues a new session for `userId` and returns the raw opaque token (the
   * only time it is ever available in plaintext). Stores just the hash plus
   * an expiry `SESSION_TTL_HOURS` in the future, and optionally the
   * requesting user-agent/IP.
   */
  async create(userId: string, ctx: SessionContext = {}): Promise<{ token: string }> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = SessionService.hashToken(token);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
      },
    });

    return { token };
  }

  /**
   * Resolves `token` to its owning user (with `roleAssignments`), or throws
   * the uniform `unauthenticated` error if the session is missing, expired,
   * or revoked. Reads fresh from the DB on every call so revocation/expiry is
   * effective immediately — never cache this result.
   */
  async validate(token: string): Promise<SessionUser> {
    const tokenHash = SessionService.hashToken(token);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { roleAssignments: true } } },
    });

    if (!session) {
      throw unauthenticatedError();
    }

    const now = new Date();
    const isExpired = session.expiresAt <= now;
    const isRevoked = session.revokedAt !== null;

    if (isExpired || isRevoked) {
      throw unauthenticatedError();
    }

    return session.user;
  }

  /**
   * Revokes the session for `token` by stamping `revokedAt`. Idempotent: a
   * missing or already-revoked session is a no-op (no error), so a double
   * logout can't fail. `updateMany` keyed on the hash both avoids a
   * not-found throw and leaves an existing `revokedAt` untouched.
   */
  async revoke(token: string): Promise<void> {
    const tokenHash = SessionService.hashToken(token);
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
