import { DomainError, Entity, Result } from '@org/shared-domain';
import { InvalidGatewayResultError } from '../errors/invalid-gateway-result.error';
import { InvalidTransactionError } from '../errors/invalid-transaction.error';
import { TransactionAlreadyFinalizedError } from '../errors/transaction-already-finalized.error';
import { GatewayPayload } from '../types/gateway-payload.type';
import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';
import { TransactionStatus } from '../types/transaction-status.type';
import { TransactionType } from '../types/transaction-type.type';
import { isBlank } from '../utils/is-blank.util';
import { canTransitionTransactionStatus } from '../utils/can-transition-transaction-status.util';
import { isUuid } from '../utils/is-uuid.util';
import { Money } from '../value-objects/money.vo';
import { CreateTransactionInput } from './create-transaction.input';
import { FinalizeTransactionInput } from './finalize-transaction.input';
import { PaymentTransactionProps } from './payment-transaction.props';

/**
 * Entry of the append-only payment ledger, owned by the {@link Payment} aggregate.
 *
 * Invariants: the amount is positive; an entry is created PENDING (charge) or SUCCESS (refund
 * confirmed by the gateway); the status follows {@link TRANSACTION_STATUS_TRANSITIONS}, so a PENDING
 * entry is finalised exactly once and a final entry never changes.
 */
export class PaymentTransaction extends Entity<string> {
  public readonly type: TransactionType;
  public readonly gateway: PaymentGatewayProvider;
  public readonly channel: PaymentChannel;
  public readonly amount: Money;
  public readonly idempotencyKey: string;
  #status: TransactionStatus;
  #gatewayTxId: string | undefined;
  #failureReason: string | undefined;
  #rawGatewayResponse: GatewayPayload | undefined;

  private constructor(props: PaymentTransactionProps) {
    super({ id: props.id, createdAt: props.createdAt });
    this.type = props.type;
    this.gateway = props.gateway;
    this.channel = props.channel;
    this.amount = props.amount;
    this.idempotencyKey = props.idempotencyKey;
    this.#status = props.status;
    this.#gatewayTxId = props.gatewayTxId;
    this.#failureReason = props.failureReason;
    this.#rawGatewayResponse = props.rawGatewayResponse;
  }

  /**
   * Opens a PENDING charge.
   *
   * @param input - Identity, gateway, amount and key.
   * @returns The entry, or an {@link InvalidTransactionError} when the input is invalid.
   */
  public static createPendingCharge(
    input: CreateTransactionInput,
  ): Result<PaymentTransaction, DomainError> {
    const inputError: DomainError | undefined =
      PaymentTransaction.findInputError(input);
    if (inputError !== undefined) {
      return Result.fail(inputError);
    }
    return Result.ok(
      new PaymentTransaction({ ...input, type: 'CHARGE', status: 'PENDING' }),
    );
  }

  /**
   * Records a refund the gateway has already confirmed.
   *
   * @param input - Identity, gateway, amount, key and the gateway refund id.
   * @returns The SUCCESS entry, or a {@link DomainError} when the input is invalid.
   */
  public static createSucceededRefund(
    input: CreateTransactionInput & { readonly gatewayTxId: string },
  ): Result<PaymentTransaction, DomainError> {
    const inputError: DomainError | undefined =
      PaymentTransaction.findInputError(input);
    if (inputError !== undefined) {
      return Result.fail(inputError);
    }
    if (isBlank(input.gatewayTxId)) {
      return Result.fail(new InvalidGatewayResultError('gatewayTxId'));
    }
    return Result.ok(
      new PaymentTransaction({ ...input, type: 'REFUND', status: 'SUCCESS' }),
    );
  }

  /**
   * Rebuilds an entry from persisted state without re-running the rules.
   *
   * @param props - Complete persisted state.
   * @returns The entry.
   */
  public static restore(props: PaymentTransactionProps): PaymentTransaction {
    return new PaymentTransaction(props);
  }

  /**
   * @returns The current status.
   */
  public get status(): TransactionStatus {
    return this.#status;
  }

  /**
   * @returns The reconciliation id at the gateway, once known.
   */
  public get gatewayTxId(): string | undefined {
    return this.#gatewayTxId;
  }

  /**
   * @returns The reason of a FAILED or CANCELLED entry.
   */
  public get failureReason(): string | undefined {
    return this.#failureReason;
  }

  /**
   * @returns The gateway payload kept for audits.
   */
  public get rawGatewayResponse(): GatewayPayload | undefined {
    return this.#rawGatewayResponse;
  }

  /**
   * @returns `true` once the entry is SUCCESS, FAILED or CANCELLED.
   */
  public isFinal(): boolean {
    return this.#status !== 'PENDING';
  }

  /**
   * Records the gateway result of a PENDING entry.
   *
   * @param input - Final status, gateway id, payload and failure reason.
   * @throws {TransactionAlreadyFinalizedError} When the entry is not PENDING (append-only ledger).
   * @throws {InvalidGatewayResultError} When the gateway transaction id is blank.
   */
  public finalize(input: FinalizeTransactionInput): void {
    if (
      !canTransitionTransactionStatus({ from: this.#status, to: input.status })
    ) {
      throw new TransactionAlreadyFinalizedError({
        transactionId: this.id,
        status: this.#status,
      });
    }
    if (isBlank(input.gatewayTxId)) {
      throw new InvalidGatewayResultError('gatewayTxId');
    }
    this.#status = input.status;
    this.#gatewayTxId = input.gatewayTxId;
    this.#rawGatewayResponse = input.rawResponse ?? this.#rawGatewayResponse;
    this.#failureReason =
      input.status === 'SUCCESS'
        ? undefined
        : (input.failureReason ?? input.status);
  }

  /**
   * @returns The first rule violated by a new entry, or `undefined`.
   */
  private static findInputError({
    id,
    amount,
    idempotencyKey,
  }: CreateTransactionInput): DomainError | undefined {
    if (!isUuid(id)) {
      return new InvalidTransactionError('id must be a UUID');
    }
    if (!amount.isPositive()) {
      return new InvalidTransactionError('amount must be positive');
    }
    if (isBlank(idempotencyKey)) {
      return new InvalidTransactionError('idempotencyKey is required');
    }
    return undefined;
  }
}
