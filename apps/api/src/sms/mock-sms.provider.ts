import { Injectable, Logger } from '@nestjs/common';

import type { SmsProvider } from './sms-provider.interface';

/** Matches a 6-digit OTP code embedded anywhere in a message body. */
const CODE_PATTERN = /\b\d{6}\b/;

/**
 * Dev/test `SmsProvider` implementation. Does not send anything over the
 * network — it logs each message (via Nest `Logger`) and records the last
 * message sent per phone number in-memory, so tests and a dev-only endpoint
 * (Task 23) can retrieve OTP codes without a real SMS gateway.
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  private readonly lastMessageByPhone = new Map<string, string>();

  async send(phone: string, message: string): Promise<void> {
    this.lastMessageByPhone.set(phone, message);
    this.logger.log(`SMS to ${phone}: ${message}`);
  }

  /** Full text of the last message sent to `phone`, if any. */
  lastMessageFor(phone: string): string | undefined {
    return this.lastMessageByPhone.get(phone);
  }

  /** 6-digit code extracted from the last message sent to `phone`, if any. */
  lastCodeFor(phone: string): string | undefined {
    const message = this.lastMessageByPhone.get(phone);
    if (!message) return undefined;
    return message.match(CODE_PATTERN)?.[0];
  }
}
