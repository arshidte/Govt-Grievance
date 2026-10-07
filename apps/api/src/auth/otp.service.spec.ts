import bcrypt from 'bcrypt';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { MockSmsProvider } from '../sms/mock-sms.provider';
import { OtpService } from './otp.service';

let phoneCounter = 0;

/** Generates a fresh, collision-free phone number for each test. */
function freshPhone(): string {
  phoneCounter += 1;
  const suffix = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
  return `+91${suffix}`;
}

describe('OtpService', () => {
  const prisma = new PrismaService();
  let sms: MockSmsProvider;
  let service: OtpService;

  beforeEach(() => {
    sms = new MockSmsProvider();
    service = new OtpService(prisma, sms);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verify fails for an expired challenge without revealing account info', async () => {
    const phone = freshPhone();
    const code = '123456';
    const codeHash = await bcrypt.hash(code, 10);
    await prisma.otpChallenge.create({
      data: {
        phone,
        codeHash,
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    const attempt = service.verify(phone, code);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('invalid_otp');
      expect(err.status).toBe(401);
      expect(err.messageKey).toBe('auth.invalidCode');
    });
  });

  it('verify fails for an already-consumed challenge', async () => {
    const phone = freshPhone();
    const code = '234567';
    const codeHash = await bcrypt.hash(code, 10);
    await prisma.otpChallenge.create({
      data: {
        phone,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        consumedAt: new Date(), // already used
      },
    });

    const attempt = service.verify(phone, code);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('invalid_otp');
      expect(err.status).toBe(401);
    });
  });

  it('verify fails after max attempts, with the same uniform error', async () => {
    const phone = freshPhone();
    const code = '345678';
    const codeHash = await bcrypt.hash(code, 10);
    await prisma.otpChallenge.create({
      data: {
        phone,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 5, // already at/over OTP_MAX_ATTEMPTS (5)
      },
    });

    const attempt = service.verify(phone, code);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('invalid_otp');
      expect(err.status).toBe(401);
      expect(err.messageKey).toBe('auth.invalidCode');
    });

    // Confirm it did NOT succeed even with the correct code, and the row is
    // not somehow consumed by this rejected attempt.
    const row = await prisma.otpChallenge.findFirst({ where: { phone } });
    expect(row?.consumedAt).toBeNull();
  });

  it('request is rate-limited per phone per hour -> ApiError rate_limited (429)', async () => {
    const phone = freshPhone();

    // OTP_RATE_LIMIT_PER_PHONE_PER_HOUR=5 in the test .env: issue 5 requests
    // successfully, then the 6th within the same hour must be rejected.
    for (let i = 0; i < 5; i += 1) {
      await service.request(phone);
    }

    const attempt = service.request(phone);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('rate_limited');
      expect(err.status).toBe(429);
      expect(err.messageKey).toBe('auth.tooMany');
    });
  });

  it('stored codeHash never equals the raw code sent via SMS', async () => {
    const phone = freshPhone();

    await service.request(phone);

    const sentMessage = sms.lastMessageFor(phone);
    expect(sentMessage).toBeDefined();
    const sentCode = sms.lastCodeFor(phone);
    expect(sentCode).toMatch(/^\d{6}$/);

    const row = await prisma.otpChallenge.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row?.codeHash).not.toBe(sentCode);
    // It must actually be a bcrypt hash of the sent code, not junk.
    const matches = await bcrypt.compare(sentCode as string, row?.codeHash as string);
    expect(matches).toBe(true);
  });

  it('verify succeeds with the correct fresh code and marks consumedAt', async () => {
    const phone = freshPhone();

    await service.request(phone);
    const code = sms.lastCodeFor(phone);
    expect(code).toMatch(/^\d{6}$/);

    const result = await service.verify(phone, code as string);

    expect(result).toEqual({ ok: true });

    const row = await prisma.otpChallenge.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.consumedAt).not.toBeNull();

    // Replaying the same code must now fail uniformly (already consumed).
    const replay = service.verify(phone, code as string);
    await expect(replay).rejects.toBeInstanceOf(ApiError);
  });
});
