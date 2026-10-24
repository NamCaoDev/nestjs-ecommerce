import { PaymentGatewayProvider } from './payment-gateway-provider.type';

/**
 * Every known payment gateway, whether or not an adapter is available for it.
 */
export const PAYMENT_GATEWAY_PROVIDERS: readonly PaymentGatewayProvider[] = [
  'VNPAY',
  'VIETQR_VA',
  'MOMO',
  'ZALOPAY',
  'STRIPE',
  'MOCK',
] as const;
