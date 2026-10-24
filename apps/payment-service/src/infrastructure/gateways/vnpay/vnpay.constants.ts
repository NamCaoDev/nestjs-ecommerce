/**
 * Fixed values of the VNPay 2.1.0 integration.
 */
export const VNPAY = {
  VERSION: '2.1.0',
  PAY_COMMAND: 'pay',
  REFUND_COMMAND: 'refund',
  CURRENCY: 'VND',
  /** VNPay amounts are in VND multiplied by 100. */
  AMOUNT_MULTIPLIER: 100,
  ORDER_TYPE: 'other',
  LOCALE: 'vn',
  HMAC_ALGORITHM: 'sha512',
  SUCCESS_CODE: '00',
  /** The customer cancelled the payment. */
  CANCELLED_CODE: '24',
  /** Refund type: 02 full, 03 partial. */
  FULL_REFUND_TYPE: '02',
  PARTIAL_REFUND_TYPE: '03',
  SECURE_HASH_FIELD: 'vnp_SecureHash',
  SECURE_HASH_TYPE_FIELD: 'vnp_SecureHashType',
  DEFAULT_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  /** Vietnam time (GMT+7) in minutes, used by every VNPay timestamp. */
  TIMEZONE_OFFSET_MINUTES: 420,
  /** Validity of a payment URL. */
  EXPIRY_MS: 900_000,
} as const;
