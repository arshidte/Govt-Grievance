import { randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

import { ApiError } from '../common/api-error';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms-provider.interface';

const BCRYPT_ROUNDS = 10;

/**
 * Uniform failure for ALL verify() rejections (no challenge found, expired,
 * already consumed, wrong code, or attempts exhausted). Deliberately does
 * NOT distinguish these cases in the response: doing so would let a caller
 * infer whether a phone number has an account, whether a code recently
 * existed, etc. Never change this to a more "helpful" per-case error
 * without a security review.
 */
function invalidOtpError(): ApiError {
  return new ApiError('invalid_otp', 401, 'auth.invalidCode');
}

/**
 * Generates and verifies phone-based OTP login codes.
 *
 * Security properties (see Task 9 brief, Review Focus #1 & #5):
 * - Codes are 6 digits from `crypto.randomInt` (CSPRNG), never `Math.random`.
 * - Only a bcrypt hash of the code is ever persisted; the plaintext is
 *   handed to the SMS provider and otherwise discarded (never logged).
 * - `request()` is rate-limited per phone per hour and returns `void`
 *   unconditionally — it never looks up whether a User exists for the
 *   phone, so its behavior/timing cannot leak account existence.
 * - `verify()` throws the same `ApiError('invalid_otp', 401, ...)` for
 *   every failure mode (missing/expired/consumed challenge, wrong code,
 *   attempts exhausted), and marks `consumedAt` inside a transaction keyed
 *   on the current `consumedAt` value so a code cannot be consumed twice
 *   under a race.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /**
   * Issues a new OTP challenge for `phone` and sends it via SMS. Always
   * resolves to `void` on success (no account-existence signal). Throws
   * `ApiError('rate_limited', 429, 'auth.tooMany')` if `phone` has
   * requested more than `OTP_RATE_LIMIT_PER_PHONE_PER_HOUR` challenges in
   * the last hour.
   */
  async request(phone: string, purpose: string = 'login'): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Rate limit is scoped to the SAME purpose, so onboarding challenges never
    // consume a phone's login quota (and vice versa). Existing login callers
    // pass the default 'login', and all pre-existing challenges are 'login',
    // so login behavior is byte-identical.
    const recentCount = await this.prisma.otpChallenge.count({
      where: { phone, purpose, createdAt: { gte: oneHourAgo } },
    });

    if (recentCount >= env.OTP_RATE_LIMIT_PER_PHONE_PER_HOUR) {
      throw new ApiError('rate_limited', 429, 'auth.tooMany');
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

    await this.prisma.otpChallenge.create({
      data: { phone, codeHash, expiresAt, purpose },
    });

    // Plaintext code exists only in this local variable and the outbound
    // SMS body. It must never be persisted or logged.
    await this.sms.send(phone, `Your verification code is ${code}. It expires in 5 minutes.`);
  }

  /**
   * Verifies `code` against the latest OTP challenge for `phone`. Returns
   * `{ ok: true }` on success; throws the uniform `invalid_otp` ApiError on
   * every failure (no challenge, expired, already consumed, wrong code, or
   * attempts exhausted) so the response never discloses which case
   * occurred.
   */
  async verify(phone: string, code: string, purpose: string = 'login'): Promise<{ ok: true }> {
    // Scope the lookup to the matching purpose so an onboarding OTP can NEVER
    // satisfy a login verification (and vice versa) — they target disjoint
    // challenge sets even for the same phone.
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw invalidOtpError();
    }

    const now = new Date();
    const isExpired = challenge.expiresAt <= now;
    const isConsumed = challenge.consumedAt !== null;
    const attemptsExhausted = challenge.attempts >= env.OTP_MAX_ATTEMPTS;

    if (isExpired || isConsumed || attemptsExhausted) {
      throw invalidOtpError();
    }

    const matches = await bcrypt.compare(code, challenge.codeHash);

    if (!matches) {
      // Record the failed attempt so repeated guessing eventually trips
      // attemptsExhausted above, even though this response looks identical
      // to every other failure.
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalidOtpError();
    }

    // Consume inside a transaction, conditioned on consumedAt still being
    // null: Postgres executes the conditional UPDATE atomically, so two
    // concurrent verify() calls racing on the same correct code can't both
    // "succeed" against the same challenge — only one updateMany reports
    // count === 1.
    const consumed = await this.prisma.$transaction((tx) =>
      tx.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      }),
    );

    if (consumed.count === 0) {
      // Lost the race to another verify() call consuming it first.
      throw invalidOtpError();
    }

    return { ok: true };
  }
}

/** Cryptographically-random 6-digit numeric code, e.g. "000427". */
function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
