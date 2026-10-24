/**
 * Fixed values of the VietQR virtual-account integration.
 */
export const VIETQR_VA = {
  /** Header carrying hex(HMAC-SHA256(raw body, VIETQR_WEBHOOK_SECRET)). */
  SIGNATURE_HEADER: 'x-vietqr-signature',
  HMAC_ALGORITHM: 'sha256',
  /** Digits of the virtual account suffix derived from the charge reference. */
  ACCOUNT_SUFFIX_LENGTH: 10,
  /** Validity of a virtual account. */
  EXPIRY_MS: 900_000,
  DEFAULT_BANK_BIN: '970422',
  DEFAULT_ACCOUNT_PREFIX: 'VQR',
  DEFAULT_ACCOUNT_NAME: 'ECOMMERCE',
} as const;
