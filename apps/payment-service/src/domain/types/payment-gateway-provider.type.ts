/**
 * Payment gateway; mirrors the `payment_gateway_provider` database enum.
 */
export type PaymentGatewayProvider =
  'VNPAY' | 'VIETQR_VA' | 'MOMO' | 'ZALOPAY' | 'STRIPE' | 'MOCK';
