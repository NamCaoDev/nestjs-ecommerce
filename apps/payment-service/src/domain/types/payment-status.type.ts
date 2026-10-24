/**
 * Lifecycle of a payment; mirrors the `payment_status` database enum. PAID once the successful charges
 * cover the total; refunds move it to PARTIALLY_REFUNDED, then REFUNDED.
 */
export type PaymentStatus =
  'PENDING' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
