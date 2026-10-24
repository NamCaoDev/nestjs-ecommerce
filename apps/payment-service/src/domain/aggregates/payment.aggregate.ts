import { AggregateRoot, DomainError, Result } from '@org/shared-domain';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { AmountMismatchError } from '../errors/amount-mismatch.error';
import { InvalidMoneyError } from '../errors/invalid-money.error';
import { InvalidPaymentStateError } from '../errors/invalid-payment-state.error';
import { RefundExceedsTotalError } from '../errors/refund-exceeds-total.error';
import { TransactionAlreadyFinalizedError } from '../errors/transaction-already-finalized.error';
import { TransactionNotFoundError } from '../errors/transaction-not-found.error';
import { PaymentInitiatedDomainEvent } from '../events/payment-initiated.domain-event';
import { PaymentStatusChangedDomainEvent } from '../events/payment-status-changed.domain-event';
import { PaymentTransactionFinalizedDomainEvent } from '../events/payment-transaction-finalized.domain-event';
import { PaymentStatus } from '../types/payment-status.type';
import { canTransitionPaymentStatus } from '../utils/can-transition-payment-status.util';
import { Money } from '../value-objects/money.vo';
import { OrderReference } from '../value-objects/order-reference.vo';
import { PaymentId } from '../value-objects/payment-id.vo';
import { ApplyRefundInput } from './apply-refund.input';
import { ApplyTransactionResultInput } from './apply-transaction-result.input';
import { CreatePaymentProps } from './create-payment.props';
import { InitiateChargeInput } from './initiate-charge.input';
import { PaymentProps } from './payment.props';
import { TransactionLookup } from './transaction-lookup.type';
import { TransactionResult } from './transaction-result.type';

/** Version of a newly created payment, before its first persistence. */
const INITIAL_VERSION = 1;

/**
 * Payment aggregate root: the payment of one order and its append-only ledger of charges and refunds.
 *
 * Invariants:
 * - the status follows {@link PAYMENT_STATUS_TRANSITIONS}: PENDING → PAID | FAILED, PAID →
 *   PARTIALLY_REFUNDED | REFUNDED, PARTIALLY_REFUNDED → PARTIALLY_REFUNDED | REFUNDED; FAILED and REFUNDED
 *   are terminal;
 * - `totalAmount` is positive and never changes, refunds included;
 * - only one charge is open or successful at a time, and only while the payment is PENDING;
 * - a ledger entry is finalised once; a successful charge must capture exactly the charged amount;
 * - refunds are allowed while PAID or PARTIALLY_REFUNDED and never exceed `totalAmount` in total.
 *
 * Every change records domain events: they feed the audit log and the transactional outbox.
 */
export class Payment extends AggregateRoot<PaymentId> {
  /** Order the payment belongs to, with its lines. */
  public readonly orderReference: OrderReference;
  /** Amount owed; immutable. */
  public readonly totalAmount: Money;
  /** Optimistic concurrency version as loaded from persistence. */
  public readonly version: number;
  #refundedAmount: Money;
  #status: PaymentStatus;
  #transactions: PaymentTransaction[];

  private constructor(props: PaymentProps) {
    super({
      id: props.id,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
    this.orderReference = props.orderReference;
    this.totalAmount = props.totalAmount;
    this.version = props.version;
    this.#refundedAmount = props.refundedAmount;
    this.#status = props.status;
    this.#transactions = [...props.transactions];
  }

  /**
   * Creates a PENDING payment without any ledger entry yet.
   *
   * @param props - Identity, order and total.
   * @returns The payment, or an {@link InvalidMoneyError} when the total is not positive.
   */
  public static create(
    props: CreatePaymentProps,
  ): Result<Payment, DomainError> {
    if (!props.totalAmount.isPositive()) {
      return Result.fail(new InvalidMoneyError('total must be positive'));
    }
    return Result.ok(
      new Payment({
        ...props,
        refundedAmount: Money.zero(props.totalAmount.currency),
        status: 'PENDING',
        transactions: [],
        version: INITIAL_VERSION,
      }),
    );
  }

  /**
   * Rebuilds a payment from persisted state without re-running the rules or raising events.
   *
   * @param props - Complete persisted state.
   * @returns The rehydrated payment.
   */
  public static restore(props: PaymentProps): Payment {
    return new Payment(props);
  }

  /**
   * @returns The current status.
   */
  public get status(): PaymentStatus {
    return this.#status;
  }

  /**
   * @returns The sum of the successful refunds.
   */
  public get refundedAmount(): Money {
    return this.#refundedAmount;
  }

  /**
   * @returns The ledger, oldest first (read-only).
   */
  public get transactions(): readonly PaymentTransaction[] {
    return this.#transactions;
  }

  /**
   * @param lookup - Transaction id, gateway transaction id or idempotency key.
   * @returns The matching ledger entry, if any.
   */
  public findTransaction(
    lookup: TransactionLookup,
  ): PaymentTransaction | undefined {
    return this.#transactions.find(
      (transaction: PaymentTransaction): boolean =>
        ('transactionId' in lookup &&
          transaction.id === lookup.transactionId) ||
        ('gatewayTxId' in lookup &&
          transaction.gatewayTxId === lookup.gatewayTxId) ||
        ('idempotencyKey' in lookup &&
          transaction.idempotencyKey === lookup.idempotencyKey),
    );
  }

  /**
   * Opens the charge of the full amount at a gateway and records a {@link PaymentInitiatedDomainEvent}.
   *
   * @param input - Charge identity, gateway, channel, key and gateway answer.
   * @returns The PENDING charge, or a {@link DomainError} when a charge is already open or paid.
   */
  public initiateCharge(
    input: InitiateChargeInput,
  ): Result<PaymentTransaction, DomainError> {
    if (this.#status !== 'PENDING' || this.hasOpenOrPaidCharge()) {
      return Result.fail(
        new InvalidPaymentStateError({
          operation: 'open a charge on',
          status: this.#status,
        }),
      );
    }
    const chargeResult: Result<PaymentTransaction, DomainError> =
      PaymentTransaction.createPendingCharge({
        ...input,
        id: input.transactionId,
        amount: this.totalAmount,
      });
    if (chargeResult.isFailure) {
      return chargeResult;
    }
    this.#transactions = [...this.#transactions, chargeResult.getValue()];
    this.addDomainEvent(this.buildInitiatedEvent(chargeResult.getValue()));
    return chargeResult;
  }

  /**
   * Records the gateway result of a PENDING charge: SUCCESS makes the payment PAID once the successful
   * charges cover the total; FAILED or CANCELLED makes it FAILED.
   *
   * @param input - Charge lookup and verified result.
   * @returns Success, or a {@link DomainError} for an unknown or final charge or a wrong amount.
   */
  public applyTransactionResult({
    lookup,
    result,
  }: ApplyTransactionResultInput): Result<void, DomainError> {
    const chargeResult: Result<PaymentTransaction, DomainError> =
      this.findPendingCharge(lookup);
    if (chargeResult.isFailure) {
      return Result.fail(chargeResult.getError());
    }
    if (this.#status !== 'PENDING') {
      return Result.fail(
        new InvalidPaymentStateError({
          operation: 'apply a charge result to',
          status: this.#status,
        }),
      );
    }
    const charge: PaymentTransaction = chargeResult.getValue();
    const amountError: DomainError | undefined = this.findAmountMismatch({
      charge,
      result,
    });
    if (amountError !== undefined) {
      return Result.fail(amountError);
    }
    charge.finalize(result);
    this.touch();
    this.addDomainEvent(this.buildFinalizedEvent(charge));
    this.applyChargeOutcome(charge);
    return Result.ok();
  }

  /**
   * Checks a refund before it is requested from the gateway.
   *
   * @param amount - Amount to refund.
   * @returns Success, or the {@link DomainError} {@link applyRefund} would return.
   */
  public checkRefund(amount: Money): Result<void, DomainError> {
    const refundError: DomainError | undefined = this.findRefundError(amount);
    return refundError === undefined ? Result.ok() : Result.fail(refundError);
  }

  /**
   * Records a refund the gateway has confirmed: appends a SUCCESS REFUND entry and adds it to
   * `refundedAmount`; the total never changes.
   *
   * @param input - Refund entry, amount, gateway id and key.
   * @returns The refund entry, or a {@link DomainError} when the payment cannot be refunded by that amount.
   */
  public applyRefund(
    input: ApplyRefundInput,
  ): Result<PaymentTransaction, DomainError> {
    const refundError: DomainError | undefined = this.findRefundError(
      input.amount,
    );
    if (refundError !== undefined) {
      return Result.fail(refundError);
    }
    const refundResult: Result<PaymentTransaction, DomainError> =
      PaymentTransaction.createSucceededRefund({
        ...input,
        id: input.transactionId,
        rawGatewayResponse: input.rawResponse,
      });
    if (refundResult.isFailure) {
      return refundResult;
    }
    const refund: PaymentTransaction = refundResult.getValue();
    this.#transactions = [...this.#transactions, refund];
    this.#refundedAmount = this.#refundedAmount.add(input.amount);
    this.touch();
    this.addDomainEvent(this.buildFinalizedEvent(refund));
    this.changeStatus({
      to: this.#refundedAmount.isGreaterThanOrEqual(this.totalAmount)
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED',
      cause: refund,
    });
    return refundResult;
  }

  /**
   * @returns `true` while a charge is PENDING or SUCCESS.
   */
  private hasOpenOrPaidCharge(): boolean {
    return this.#transactions.some(
      (transaction: PaymentTransaction): boolean =>
        transaction.type === 'CHARGE' &&
        (transaction.status === 'PENDING' || transaction.status === 'SUCCESS'),
    );
  }

  /**
   * @returns The PENDING charge matching the lookup, or why there is none.
   */
  private findPendingCharge(
    lookup: TransactionLookup,
  ): Result<PaymentTransaction, DomainError> {
    const transaction: PaymentTransaction | undefined =
      this.findTransaction(lookup);
    if (transaction === undefined || transaction.type !== 'CHARGE') {
      return Result.fail(
        new TransactionNotFoundError(Object.values(lookup).join()),
      );
    }
    if (transaction.isFinal()) {
      return Result.fail(
        new TransactionAlreadyFinalizedError({
          transactionId: transaction.id,
          status: transaction.status,
        }),
      );
    }
    return Result.ok(transaction);
  }

  /**
   * @returns An {@link AmountMismatchError} when a successful result reports another amount.
   */
  private findAmountMismatch({
    charge,
    result,
  }: {
    readonly charge: PaymentTransaction;
    readonly result: TransactionResult;
  }): AmountMismatchError | undefined {
    if (result.status !== 'SUCCESS' || result.amount === undefined) {
      return undefined;
    }
    const reportedResult: Result<Money, DomainError> = Money.create({
      amount: result.amount,
      currency: charge.amount.currency,
    });
    if (
      reportedResult.isSuccess &&
      reportedResult.getValue().equals(charge.amount)
    ) {
      return undefined;
    }
    return new AmountMismatchError({
      transactionId: charge.id,
      expected: charge.amount.amount,
      reported: result.amount,
    });
  }

  /**
   * Moves the PENDING payment after a charge result.
   */
  private applyChargeOutcome(charge: PaymentTransaction): void {
    if (charge.status !== 'SUCCESS') {
      this.changeStatus({ to: 'FAILED', cause: charge });
      return;
    }
    if (this.sumSucceededCharges().isGreaterThanOrEqual(this.totalAmount)) {
      this.changeStatus({ to: 'PAID', cause: charge });
    }
  }

  /**
   * @returns The sum of the successful charges.
   */
  private sumSucceededCharges(): Money {
    return this.#transactions
      .filter(
        (transaction: PaymentTransaction): boolean =>
          transaction.type === 'CHARGE' && transaction.status === 'SUCCESS',
      )
      .reduce(
        (sum: Money, transaction: PaymentTransaction): Money =>
          sum.add(transaction.amount),
        Money.zero(this.totalAmount.currency),
      );
  }

  /**
   * @returns The first rule a refund of `amount` would break, or `undefined`.
   */
  private findRefundError(amount: Money): DomainError | undefined {
    if (!canTransitionPaymentStatus({ from: this.#status, to: 'REFUNDED' })) {
      return new InvalidPaymentStateError({
        operation: 'refund',
        status: this.#status,
      });
    }
    if (!amount.hasSameCurrency(this.totalAmount) || !amount.isPositive()) {
      return new InvalidMoneyError(
        `refund must be a positive ${this.totalAmount.currency} amount`,
      );
    }
    if (
      !this.totalAmount.isGreaterThanOrEqual(this.#refundedAmount.add(amount))
    ) {
      return new RefundExceedsTotalError({
        requested: amount.amount,
        refundable: this.totalAmount.subtract(this.#refundedAmount).amount,
        currency: amount.currency,
      });
    }
    return undefined;
  }

  /**
   * Records a status transition and its {@link PaymentStatusChangedDomainEvent}.
   *
   * @throws {InvalidPaymentStateError} When the state machine forbids the move (invariant violation:
   *   every caller checks its operation first).
   */
  private changeStatus({
    to,
    cause,
  }: {
    readonly to: PaymentStatus;
    readonly cause: PaymentTransaction;
  }): void {
    const from: PaymentStatus = this.#status;
    if (!canTransitionPaymentStatus({ from, to })) {
      throw new InvalidPaymentStateError({
        operation: `move to ${to}`,
        status: from,
      });
    }
    this.#status = to;
    this.addDomainEvent(
      new PaymentStatusChangedDomainEvent({
        paymentId: this.id.value,
        orderId: this.orderReference.orderId,
        from,
        to,
        transactionId: cause.id,
        gatewayTxId: cause.gatewayTxId ?? '',
        totalAmount: this.totalAmount.amount,
        refundedAmount: this.#refundedAmount.amount,
        currency: this.totalAmount.currency,
        failureReason: cause.failureReason,
        lines: this.orderReference.lines,
        occurredAt: this.updatedAt,
      }),
    );
  }

  /**
   * @returns The event describing the opening of a charge.
   */
  private buildInitiatedEvent(
    charge: PaymentTransaction,
  ): PaymentInitiatedDomainEvent {
    return new PaymentInitiatedDomainEvent({
      paymentId: this.id.value,
      orderId: this.orderReference.orderId,
      transactionId: charge.id,
      gateway: charge.gateway,
      channel: charge.channel,
      amount: charge.amount.amount,
      currency: charge.amount.currency,
      occurredAt: charge.createdAt,
    });
  }

  /**
   * @returns The event describing a ledger entry that reached its final status.
   */
  private buildFinalizedEvent(
    transaction: PaymentTransaction,
  ): PaymentTransactionFinalizedDomainEvent {
    return new PaymentTransactionFinalizedDomainEvent({
      paymentId: this.id.value,
      orderId: this.orderReference.orderId,
      transactionId: transaction.id,
      type: transaction.type,
      status: transaction.status,
      gatewayTxId: transaction.gatewayTxId ?? '',
      amount: transaction.amount.amount,
      currency: transaction.amount.currency,
      failureReason: transaction.failureReason,
      occurredAt: this.updatedAt,
    });
  }
}
