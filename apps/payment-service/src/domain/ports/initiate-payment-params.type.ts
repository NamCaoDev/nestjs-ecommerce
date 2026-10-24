import { PaymentChannel } from '../types/payment-channel.type';

/**
 * Input of {@link PaymentGatewayPort.initiate}.
 */
export interface InitiatePaymentParams {
  readonly paymentId: string;
  /** Charge UUID; sent to the gateway as the merchant reference and echoed back by its webhook. */
  readonly transactionId: string;
  readonly orderId: string;
  /** Amount in major currency units. */
  readonly amount: number;
  readonly currency: string;
  readonly channel: PaymentChannel;
  /** Text shown to the customer by the gateway. */
  readonly description: string;
}
