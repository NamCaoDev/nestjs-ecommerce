import { Payment } from '../aggregates/payment.aggregate';
import { AuditEntry } from './audit-entry.type';

/**
 * Input of {@link PaymentRepositoryPort.saveNew} and {@link PaymentRepositoryPort.save}.
 */
export interface SavePaymentInput {
  readonly payment: Payment;
  /** Activity rows derived from the pending domain events, written in the same transaction. */
  readonly auditEntries: readonly AuditEntry[];
}
