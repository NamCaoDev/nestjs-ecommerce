import { PaymentActorType } from '../../domain/types/payment-actor-type.type';

/**
 * Input of {@link PaymentAuditService.recordProtocolEvent}.
 */
export interface RecordProtocolEventInput {
  readonly paymentId: string;
  readonly transactionId?: string;
  readonly action: string;
  readonly actorType: PaymentActorType;
  readonly actorId?: string;
  /** Details; sanitised before storage. */
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly ipAddress?: string;
}
