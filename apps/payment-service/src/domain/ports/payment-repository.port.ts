import { Result } from '@org/shared-domain';
import { Payment } from '../aggregates/payment.aggregate';
import { DuplicatePaymentError } from '../errors/duplicate-payment.error';
import { SavePaymentInput } from './save-payment.input';

/**
 * Persistence port for the {@link Payment} aggregate and its ledger. Implemented in the infrastructure
 * layer and injected with {@link PAYMENT_REPOSITORY_PORT}. Each save is one local ACID transaction
 * holding the payment, its new or finalised ledger entries, the audit rows and the outbox messages
 * derived from the pending domain events (CLAUDE.md §3.2), after which the events are cleared.
 */
export interface PaymentRepositoryPort {
  /**
   * @param paymentId - Payment UUID.
   * @returns The payment with its ledger, or `undefined`.
   */
  findById(paymentId: string): Promise<Payment | undefined>;

  /**
   * @param orderId - Logical order identifier.
   * @returns The payment of the order with its ledger, or `undefined`.
   */
  findByOrderId(orderId: string): Promise<Payment | undefined>;

  /**
   * @param transactionId - Ledger entry UUID (the merchant reference sent to gateways).
   * @returns The payment owning the entry, or `undefined`.
   */
  findByTransactionId(transactionId: string): Promise<Payment | undefined>;

  /**
   * Inserts a new payment.
   *
   * @param input - Payment and audit rows.
   * @returns Success, or a {@link DuplicatePaymentError} when the order or a ledger key already exists.
   */
  saveNew(
    input: SavePaymentInput,
  ): Promise<Result<void, DuplicatePaymentError>>;

  /**
   * Persists the changes of a loaded payment against its loaded version.
   *
   * @param input - Payment and audit rows.
   * @throws {PaymentConcurrencyConflictError} When the payment changed in storage since it was loaded.
   */
  save(input: SavePaymentInput): Promise<void>;
}
