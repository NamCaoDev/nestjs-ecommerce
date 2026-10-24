/**
 * Fixed values of the MOCK gateway.
 */
export const MOCK_GATEWAY = {
  /** Header carrying hex(HMAC-SHA256(raw body, MOCK_GATEWAY_SECRET)). */
  SIGNATURE_HEADER: 'x-webhook-signature',
  /** Environment variable holding the shared secret. */
  SECRET_VARIABLE: 'MOCK_GATEWAY_SECRET',
  /** Environment variable holding the base URL of the mock checkout pages. */
  BASE_URL_VARIABLE: 'MOCK_GATEWAY_BASE_URL',
  DEFAULT_BASE_URL: 'https://mock-gateway.local',
  /** Refund reason that makes the mock gateway refuse a refund. */
  DECLINED_REFUND_REASON: 'MOCK_REFUND_DECLINED',
  /** Validity of a mock virtual account. */
  VIRTUAL_ACCOUNT_TTL_MS: 900_000,
  HMAC_ALGORITHM: 'sha256',
} as const;
