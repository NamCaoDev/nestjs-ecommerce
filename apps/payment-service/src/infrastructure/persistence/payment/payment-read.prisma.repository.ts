import { Injectable } from '@nestjs/common';
import { PaymentReadPort } from '../../../application/ports/payment-read.port';
import { PaymentActivityReadModel } from '../../../application/read-models/payment-activity.read-model';
import { PaymentTransactionReadModel } from '../../../application/read-models/payment-transaction.read-model';
import { PaymentReadModel } from '../../../application/read-models/payment.read-model';
import { PaymentAuditLog } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentTransactionRecord } from './payment-transaction.record';
import { PaymentWithTransactionsRecord } from './payment-with-transactions.record';

/**
 * Prisma implementation of {@link PaymentReadPort}: maps rows directly, without rebuilding aggregates.
 */
@Injectable()
export class PaymentReadPrismaRepository implements PaymentReadPort {
  /**
   * @param prisma - Client for `payment_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param orderId - Logical order identifier.
   * @returns The payment with its ledger, or `undefined`.
   */
  public async findByOrderId(
    orderId: string,
  ): Promise<PaymentReadModel | undefined> {
    const record: PaymentWithTransactionsRecord | null =
      await this.prisma.client.payment.findUnique({
        where: { orderId },
        include: {
          transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
    return record === null
      ? undefined
      : PaymentReadPrismaRepository.toReadModel(record);
  }

  /**
   * @param paymentId - Payment UUID.
   * @returns The activity log oldest first, or `undefined` for an unknown payment.
   */
  public async findActivities(
    paymentId: string,
  ): Promise<readonly PaymentActivityReadModel[] | undefined> {
    const [paymentCount, rows]: [number, PaymentAuditLog[]] =
      await this.prisma.client.$transaction([
        this.prisma.client.payment.count({ where: { id: paymentId } }),
        this.prisma.client.paymentAuditLog.findMany({
          where: { paymentId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
    return paymentCount === 0
      ? undefined
      : rows.map(PaymentReadPrismaRepository.toActivity);
  }

  /**
   * @param transactionId - Ledger entry UUID.
   * @returns The payment owning the entry, or `undefined`.
   */
  public async findPaymentIdByTransactionId(
    transactionId: string,
  ): Promise<string | undefined> {
    const row: { paymentId: string } | null =
      await this.prisma.client.paymentTransaction.findUnique({
        where: { id: transactionId },
        select: { paymentId: true },
      });
    return row?.paymentId;
  }

  /**
   * @returns The read model of a payment row; the client action of its pending charge, if any.
   */
  private static toReadModel(
    record: PaymentWithTransactionsRecord,
  ): PaymentReadModel {
    const pendingCharge: PaymentTransactionRecord | undefined =
      record.transactions.find(
        (row: PaymentTransactionRecord): boolean =>
          row.type === 'CHARGE' && row.status === 'PENDING',
      );
    const rawResponse: Record<string, unknown> | null =
      (pendingCharge?.rawGatewayResponse as Record<string, unknown> | null) ??
      null;
    return {
      paymentId: record.id,
      orderId: record.orderId,
      customerId: record.customerId,
      status: record.status,
      totalAmount: record.totalAmount.toNumber(),
      refundedAmount: record.refundedAmount.toNumber(),
      currency: record.currency,
      clientAction:
        (rawResponse?.['clientAction'] as
          Record<string, unknown> | undefined) ?? null,
      transactions: record.transactions.map(
        PaymentReadPrismaRepository.toTransaction,
      ),
      version: record.version,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.updatedAt.getTime(),
    };
  }

  /**
   * @returns The read model of a ledger row.
   */
  private static toTransaction(
    row: PaymentTransactionRecord,
  ): PaymentTransactionReadModel {
    return {
      transactionId: row.id,
      type: row.type,
      gateway: row.gateway,
      channel: row.channel,
      status: row.status,
      amount: row.amount.toNumber(),
      gatewayTxId: row.gatewayTxId,
      failureReason: row.failureReason,
      createdAt: row.createdAt.getTime(),
    };
  }

  /**
   * @returns The read model of an audit row.
   */
  private static toActivity(row: PaymentAuditLog): PaymentActivityReadModel {
    return {
      activityId: row.id,
      paymentId: row.paymentId,
      transactionId: row.transactionId,
      action: row.action,
      actorType: row.actorType,
      actorId: row.actorId,
      stateFrom: row.stateFrom,
      stateTo: row.stateTo,
      payload: row.payload as Record<string, unknown> | null,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.getTime(),
    };
  }
}
