import { PaymentActorType } from '../../domain/types/payment-actor-type.type';

/**
 * Row of the payment activity log, for operations and customer care.
 */
export interface PaymentActivityReadModel {
  readonly activityId: string;
  readonly paymentId: string;
  readonly transactionId: string | null;
  readonly action: string;
  readonly actorType: PaymentActorType;
  readonly actorId: string | null;
  readonly stateFrom: string | null;
  readonly stateTo: string | null;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly ipAddress: string | null;
  /** Epoch milliseconds. */
  readonly createdAt: number;
}
