/**
 * Abstraction over the SMS transport used to deliver OTP codes.
 *
 * Production implementations wrap a real SMS gateway; `MockSmsProvider`
 * (used in dev/test) logs the message and records it in-memory instead of
 * sending anything. Consumers (e.g. the OTP service in Task 9) depend only
 * on this interface, injected via the `SMS_PROVIDER` DI token — swapping
 * the underlying implementation requires no change outside `src/sms/`.
 */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

/** DI token for injecting the active `SmsProvider` implementation. */
export const SMS_PROVIDER = 'SMS_PROVIDER';
