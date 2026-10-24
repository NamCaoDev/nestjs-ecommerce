import { Injectable } from '@nestjs/common';
import { Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentTransaction } from '../../../domain/entities/payment-transaction.entity';
import { DuplicatePaymentError } from '../../../domain/errors/duplicate-payment.error';
import { PaymentConcurrencyConflictError } from '../../../domain/errors/payment-concurrency-conflict.error';
import { AuditEntry } from '../../../domain/ports/audit-entry.type';
import { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { SavePaymentInput } from '../../../domain/ports/save-payment.input';
import { AuditLogRowMapper } from '../audit/audit-log-row.mapper';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDuplicatePaymentViolation } from './is-duplicate-payment-violation.util';
import { OutboxEventMapper } from './outbox-event.mapper';
import { PaymentPersistenceMapper } from './payment-persistence.mapper';
import { PaymentWithTransactionsRecord } from './payment-with-transactions.record';

/** Loads a payment with its ledger, oldest entry first. */
const WITH_TRANSACTIONS = {
  transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} as const satisfies Prisma.PaymentInclude;

/**
 * Prisma implementation of {@link PaymentRepositoryPort} on `payment_db`. Every save is one local
 * transaction: payment row (optimistic version), new ledger entries, PENDING entries just finalised,
 * audit rows and outbox messages. Finalised ledger entries are never written again, which the
 * database triggers enforce as well.
 */
@Injectable()
export class PaymentPrismaRepository implements PaymentRepositoryPort {
  /**
   * @param prisma - Client for `payment_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param paymentId - Payment UUID.
   * @returns The payment, or `undefined`.
   */
  public findById(paymentId: string): Promise<Payment | undefined> {
    return this.findOne({ id: paymentId });
  }

  /**
   * @param orderId - Logical order identifier.
   * @returns The payment of the order, or `undefined`.
   */
  public findByOrderId(orderId: string): Promise<Payment | undefined> {
    return this.findOne({ orderId });
  }

  /**
   * @param transactionId - Ledger entry UUID.
   * @returns The payment owning the entry, or `undefined`.
   */
  public findByTransactionId(
    transactionId: string,
  ): Promise<Payment | undefined> {
    return this.findOne({ transactions: { some: { id: transactionId } } });
  }

  /**
   * @param input - New payment and audit rows.
   * @returns Success, or a {@link DuplicatePaymentError} when the order or a ledger key already exists.
   */
  public async saveNew({
    payment,
    auditEntries,
  }: SavePaymentInput): Promise<Result<void, DuplicatePaymentError>> {
    try {
      await this.prisma.client.$transaction(
        async (transaction: Prisma.TransactionClient): Promise<void> => {
          await transaction.payment.create({
            data: PaymentPersistenceMapper.toPaymentRow(payment),
          });
          await PaymentPrismaRepository.saveLedgerAndLogs({
            transaction,
            payment,
            newEntries: payment.transactions,
            auditEntries,
          });
        },
      );
    } catch (err: unknown) {
      if (isDuplicatePaymentViolation(err)) {
        return Result.fail(
          new DuplicatePaymentError(payment.orderReference.orderId),
        );
      }
      throw err;
    }
    payment.clearEvents();
    return Result.ok();
  }

  /**
   * @param input - Changed payment and audit rows.
   * @throws {PaymentConcurrencyConflictError} When the stored version or a PENDING entry moved on, or a
   *   concurrent request stored the same ledger key.
   */
  public async save({
    payment,
    auditEntries,
  }: SavePaymentInput): Promise<void> {
    await this.executeSave({ payment, auditEntries }).catch(
      (err: unknown): Promise<never> =>
        Promise.reject(
          isDuplicatePaymentViolation(err)
            ? new PaymentConcurrencyConflictError(payment.id.value)
            : err,
        ),
    );
    payment.clearEvents();
  }

  /**
   * Writes the changes of a loaded payment in one transaction.
   */
  private async executeSave({
    payment,
    auditEntries,
  }: SavePaymentInput): Promise<void> {
    await this.prisma.client.$transaction(
      async (transaction: Prisma.TransactionClient): Promise<void> => {
        await PaymentPrismaRepository.updatePaymentRow({
          transaction,
          payment,
        });
        const storedStatuses: ReadonlyMap<string, string> =
          await PaymentPrismaRepository.findStoredStatuses({
            transaction,
            paymentId: payment.id.value,
          });
        await PaymentPrismaRepository.updateFinalizedEntries({
          transaction,
          payment,
          storedStatuses,
        });
        await PaymentPrismaRepository.saveLedgerAndLogs({
          transaction,
          payment,
          newEntries: payment.transactions.filter(
            (entry: PaymentTransaction): boolean =>
              !storedStatuses.has(entry.id),
          ),
          auditEntries,
        });
      },
    );
  }

  /**
   * @returns The payment matching the filter, with its ledger.
   */
  private async findOne(
    where: Prisma.PaymentWhereInput,
  ): Promise<Payment | undefined> {
    const record: PaymentWithTransactionsRecord | null =
      await this.prisma.client.payment.findFirst({
        where,
        include: WITH_TRANSACTIONS,
      });
    return record === null
      ? undefined
      : PaymentPersistenceMapper.toDomain(record);
  }

  /**
   * Updates status and refunded amount if the stored version still matches.
   */
  private static async updatePaymentRow({
    transaction,
    payment,
  }: {
    readonly transaction: Prisma.TransactionClient;
    readonly payment: Payment;
  }): Promise<void> {
    const { count }: { count: number } = await transaction.payment.updateMany({
      where: { id: payment.id.value, version: payment.version },
      data: {
        status: payment.status,
        refundedAmount: payment.refundedAmount.amount,
        version: { increment: 1 },
        updatedAt: new Date(payment.updatedAt),
      },
    });
    if (count === 0) {
      throw new PaymentConcurrencyConflictError(payment.id.value);
    }
  }

  /**
   * @returns The stored status of every ledger entry of the payment, by id.
   */
  private static async findStoredStatuses({
    transaction,
    paymentId,
  }: {
    readonly transaction: Prisma.TransactionClient;
    readonly paymentId: string;
  }): Promise<ReadonlyMap<string, string>> {
    const rows: { id: string; status: string }[] =
      await transaction.paymentTransaction.findMany({
        where: { paymentId },
        select: { id: true, status: true },
      });
    return new Map(
      rows.map((row: { id: string; status: string }): [string, string] => [
        row.id,
        row.status,
      ]),
    );
  }

  /**
   * Writes the outcome of the entries that were PENDING in storage and are final now.
   */
  private static async updateFinalizedEntries({
    transaction,
    payment,
    storedStatuses,
  }: {
    readonly transaction: Prisma.TransactionClient;
    readonly payment: Payment;
    readonly storedStatuses: ReadonlyMap<string, string>;
  }): Promise<void> {
    const finalized: PaymentTransaction[] = payment.transactions.filter(
      (entry: PaymentTransaction): boolean =>
        entry.isFinal() && storedStatuses.get(entry.id) === 'PENDING',
    );
    for (const entry of finalized) {
      const { count }: { count: number } =
        await transaction.paymentTransaction.updateMany({
          where: { id: entry.id, status: 'PENDING' },
          data: PaymentPersistenceMapper.toOutcomeColumns(entry),
        });
      if (count === 0) {
        throw new PaymentConcurrencyConflictError(payment.id.value);
      }
    }
  }

  /**
   * Inserts new ledger entries, then the audit rows and the outbox messages of the pending events.
   */
  private static async saveLedgerAndLogs({
    transaction,
    payment,
    newEntries,
    auditEntries,
  }: {
    readonly transaction: Prisma.TransactionClient;
    readonly payment: Payment;
    readonly newEntries: readonly PaymentTransaction[];
    readonly auditEntries: readonly AuditEntry[];
  }): Promise<void> {
    await transaction.paymentTransaction.createMany({
      data: newEntries.map(
        (entry: PaymentTransaction): Prisma.PaymentTransactionCreateManyInput =>
          PaymentPersistenceMapper.toTransactionRow({
            paymentId: payment.id.value,
            transaction: entry,
          }),
      ),
    });
    await transaction.paymentAuditLog.createMany({
      data: auditEntries.map(AuditLogRowMapper.toCreateInput),
    });
    await transaction.outboxEvent.createMany({
      data: OutboxEventMapper.toCreateInputs(payment.domainEvents),
    });
  }
}
