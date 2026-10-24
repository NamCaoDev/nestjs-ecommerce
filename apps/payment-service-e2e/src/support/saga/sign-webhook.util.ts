import { createHmac } from 'node:crypto';

/** Secret shared with the MOCK gateway adapter; matches `apps/payment-service/.env.example`. */
const MOCK_GATEWAY_SECRET: string =
  process.env['E2E_MOCK_GATEWAY_SECRET'] ??
  'local-mock-gateway-secret-change-me';

/**
 * Signs a webhook body as the MOCK gateway does.
 *
 * @param rawBody - Exact body that will be sent.
 * @returns hex(HMAC-SHA256(rawBody, MOCK_GATEWAY_SECRET)).
 */
export function signWebhook(rawBody: string): string {
  return createHmac('sha256', MOCK_GATEWAY_SECRET)
    .update(rawBody)
    .digest('hex');
}
