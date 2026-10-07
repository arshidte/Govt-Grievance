import { describe, expect, it } from 'vitest';

import { MockSmsProvider } from './mock-sms.provider';

describe('MockSmsProvider', () => {
  it('stores the message and lastMessageFor(phone) returns it', async () => {
    const provider = new MockSmsProvider();
    const phone = '+919876543210';
    const message = 'Your verification code is 123456';

    await provider.send(phone, message);

    expect(provider.lastMessageFor(phone)).toBe(message);
  });

  it('extracts the 6-digit code from the last message via lastCodeFor(phone)', async () => {
    const provider = new MockSmsProvider();
    const phone = '+919876543210';
    const message = 'Your verification code is 654321. It expires in 5 minutes.';

    await provider.send(phone, message);

    expect(provider.lastCodeFor(phone)).toBe('654321');
  });

  it('returns undefined for lastMessageFor/lastCodeFor when no message was sent to that phone', () => {
    const provider = new MockSmsProvider();

    expect(provider.lastMessageFor('+919999999999')).toBeUndefined();
    expect(provider.lastCodeFor('+919999999999')).toBeUndefined();
  });
});
