import { PaymentGatewayPort } from '../../domain/ports/payment-gateway.port';
import { PaymentChannel } from '../../domain/types/payment-channel.type';

/**
 * Gateway and channel used for new payments.
 */
export interface DefaultGatewaySelection {
  readonly gateway: PaymentGatewayPort;
  readonly channel: PaymentChannel;
}
