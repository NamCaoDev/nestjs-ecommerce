import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';

/**
 * Data carried by a {@link PaymentInitiatedDomainEvent}.
 */
export interface PaymentInitiatedDomainEventProps {
  readonly paymentId: string;
  readonly orderId: string;
  readonly transactionId: string;
  readonly gateway: PaymentGatewayProvider;
  readonly channel: PaymentChannel;
  /** Charged amount in major currency units. */
  readonly amount: number;
  readonly currency: string;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
