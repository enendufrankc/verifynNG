/**
 * SmsPort — outbound SMS provider interface (E14 binds the real one).
 *
 * E06 ships `HttpFakeSms` against the compose `fake-sms` service behind the
 * `SMS_PORT` token. E14 (Termii credentials) will swap the implementation
 * without touching the verify-sms controller.
 */
export const SMS_PORT = Symbol('SMS_PORT');

export interface SmsPort {
  send(params: {
    to: string;
    body: string;
    tenantId?: string;
  }): Promise<{ providerMessageId: string }>;
}
