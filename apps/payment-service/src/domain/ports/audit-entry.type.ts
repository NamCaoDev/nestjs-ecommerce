import { PaymentActorType } from '../types/payment-actor-type.type';

/**
 * One row of the append-only payment activity log.
 */
export interface AuditEntry {
  readonly paymentId: string;
  readonly transactionId?: string;
  /** e.g. PAYMENT_INITIATED, TRANSACTION_FINALIZED, STATE_CHANGED, WEBHOOK_SIGNATURE_MISMATCH. */
  readonly action: string;
  readonly actorType: PaymentActorType;
  readonly actorId?: string;
  readonly stateFrom?: string;
  readonly stateTo?: string;
  /** Sanitised details: secrets and signatures are masked. */
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly ipAddress?: string;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
