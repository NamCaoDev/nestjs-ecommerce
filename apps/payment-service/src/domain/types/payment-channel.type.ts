/**
 * How the customer pays; mirrors the `payment_channel` database enum.
 */
export type PaymentChannel =
  'QR_CODE' | 'DOMESTIC_BANK' | 'INTERNATIONAL_CARD' | 'BANK_TRANSFER';
