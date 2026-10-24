import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentTransaction } from '../../../domain/entities/payment-transaction.entity';
import { GatewayPayload } from '../../../domain/types/gateway-payload.type';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderReference } from '../../../domain/value-objects/order-reference.vo';
import { PaymentId } from '../../../domain/value-objects/payment-id.vo';
import { PaymentLine } from '../../../domain/value-objects/payment-line.type';
import { Prisma } from '../prisma/generated/client';
import { PaymentTransactionRecord } from './payment-transaction.record';
import { PaymentWithTransactionsRecord } from './payment-with-transactions.record';
import { toJsonInput } from './to-json-input.util';

/**
 * Translates between the {@link Payment} aggregate and the `payments` / `payment_transactions` tables.
 * Stored data is trusted: an invalid row is a corruption and throws.
 */
export class PaymentPersistenceMapper {
  /**
   * @param payment - New payment.
   * @returns The `payments` row.
   */
  public static toPaymentRow(payment: Payment): Prisma.PaymentCreateManyInput {
    return {
      id: payment.id.value,
      orderId: payment.orderReference.orderId,
      customerId: payment.orderReference.customerId,
      totalAmount: payment.totalAmount.amount,
      refundedAmount: payment.refundedAmount.amount,
      currency: payment.totalAmount.currency,
      status: payment.status,
      lineItems: toJsonInput(
        payment.orderReference.lines,
      ) as Prisma.InputJsonValue,
      version: payment.version,
      createdAt: new Date(payment.createdAt),
      updatedAt: new Date(payment.updatedAt),
    };
  }

  /**
   * @param input - Payment id and ledger entry.
   * @returns The `payment_transactions` row.
   */
  public static toTransactionRow({
    paymentId,
    transaction,
  }: {
    readonly paymentId: string;
    readonly transaction: PaymentTransaction;
  }): Prisma.PaymentTransactionCreateManyInput {
    return {
      id: transaction.id,
      paymentId,
      type: transaction.type,
      gateway: transaction.gateway,
      channel: transaction.channel,
      amount: transaction.amount.amount,
      createdAt: new Date(transaction.createdAt),
      idempotencyKey: transaction.idempotencyKey,
      ...PaymentPersistenceMapper.toOutcomeColumns(transaction),
    };
  }

  /**
   * @param transaction - Ledger entry.
   * @returns The columns that change when a PENDING entry is finalised.
   */
  public static toOutcomeColumns(transaction: PaymentTransaction): {
    status: PaymentTransaction['status'];
    gatewayTxId: string | null;
    failureReason: string | null;
    rawGatewayResponse: Prisma.InputJsonValue | typeof Prisma.DbNull;
  } {
    return {
      status: transaction.status,
      gatewayTxId: transaction.gatewayTxId ?? null,
      failureReason: transaction.failureReason ?? null,
      rawGatewayResponse: toJsonInput(transaction.rawGatewayResponse),
    };
  }

  /**
   * @param record - Stored payment and ledger.
   * @returns The rehydrated aggregate.
   */
  public static toDomain(record: PaymentWithTransactionsRecord): Payment {
    const currency: string = record.currency;
    return Payment.restore({
      id: PaymentId.create(record.id).getValue(),
      orderReference: OrderReference.create({
        orderId: record.orderId,
        customerId: record.customerId,
        lines: record.lineItems as unknown as readonly PaymentLine[],
      }).getValue(),
      totalAmount: PaymentPersistenceMapper.toMoney(
        record.totalAmount,
        currency,
      ),
      refundedAmount: PaymentPersistenceMapper.toMoney(
        record.refundedAmount,
        currency,
      ),
      status: record.status,
      transactions: record.transactions.map(
        (row: PaymentTransactionRecord): PaymentTransaction =>
          PaymentPersistenceMapper.toDomainTransaction({ row, currency }),
      ),
      version: record.version,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.updatedAt.getTime(),
    });
  }

  /**
   * @returns The ledger entry of a row.
   */
  private static toDomainTransaction({
    row,
    currency,
  }: {
    readonly row: PaymentTransactionRecord;
    readonly currency: string;
  }): PaymentTransaction {
    return PaymentTransaction.restore({
      id: row.id,
      type: row.type,
      gateway: row.gateway,
      channel: row.channel,
      amount: PaymentPersistenceMapper.toMoney(row.amount, currency),
      status: row.status,
      gatewayTxId: row.gatewayTxId ?? undefined,
      failureReason: row.failureReason ?? undefined,
      idempotencyKey: row.idempotencyKey,
      rawGatewayResponse:
        (row.rawGatewayResponse as GatewayPayload | null) ?? undefined,
      createdAt: row.createdAt.getTime(),
    });
  }

  /**
   * @returns The money value of a stored decimal.
   */
  private static toMoney(amount: Prisma.Decimal, currency: string): Money {
    return Money.create({ amount: amount.toNumber(), currency }).getValue();
  }
}
