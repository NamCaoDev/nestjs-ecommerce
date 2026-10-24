/** Prefix of customer-facing order codes. */
const ORDER_CODE_PREFIX = 'ORD-';

/** Number of trailing hexadecimal characters of the order UUID kept in the code (48 random bits). */
const ORDER_CODE_HEX_LENGTH = 12;

/**
 * Derives the customer-facing order code from the order UUID, e.g. `ORD-1A2B3C4D5E6F`.
 * Deterministic, so it can be recomputed on every read without being stored.
 *
 * @param orderId - Order UUID.
 * @returns The order code.
 */
export function buildOrderCode(orderId: string): string {
  const hexDigits: string = orderId.replaceAll('-', '');
  return `${ORDER_CODE_PREFIX}${hexDigits.slice(-ORDER_CODE_HEX_LENGTH).toUpperCase()}`;
}
