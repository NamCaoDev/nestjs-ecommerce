import { DomainError, Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { DuplicatePaymentError } from '../../../domain/errors/duplicate-payment.error';
import { PaymentConcurrencyConflictError } from '../../../domain/errors/payment-concurrency-conflict.error';
import { AuditEntry } from '../../../domain/ports/audit-entry.type';
import { createTestPayment } from '../../../testing/create-test-payment.util';
import { TEST_IDS } from '../../../testing/test-ids';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentPrismaRepository } from './payment-prisma.repository';

/** Transaction client double exposing only the delegates the repository uses. */
interface MockTransactionClient {
  readonly payment: {
    readonly create: jest.Mock;
    readonly updateMany: jest.Mock;
  };
  readonly paymentTransaction: {
    readonly createMany: jest.Mock;
    readonly updateMany: jest.Mock;
    readonly findMany: jest.Mock;
  };
  readonly paymentAuditLog: { readonly createMany: jest.Mock };
  readonly outboxEvent: { readonly createMany: jest.Mock };
}

/** Activity row passed to every save. */
const AUDIT_ENTRY: AuditEntry = {
  paymentId: TEST_IDS.PAYMENT,
  transactionId: TEST_IDS.CHARGE,
  action: 'STATE_CHANGED',
  actorType: 'GATEWAY',
  occurredAt: 1,
};

/**
 * Builds the error Prisma 7 raises through the pg adapter for a unique violation on `index`.
 */
const createMockUniqueViolation = (
  index: string,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });

describe('PaymentPrismaRepository', () => {
  let mockTransaction: MockTransactionClient;
  let mockPrisma: {
    readonly $transaction: jest.Mock;
    readonly payment: { readonly findFirst: jest.Mock };
  };
  let repository: PaymentPrismaRepository;
  beforeEach(() => {
    mockTransaction = {
      payment: {
        create: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: TEST_IDS.CHARGE, status: 'PENDING' }]),
      },
      paymentAuditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    mockPrisma = {
      $transaction: jest.fn(
        (work: (transaction: MockTransactionClient) => Promise<void>) =>
          work(mockTransaction),
      ),
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    repository = new PaymentPrismaRepository({
      client: mockPrisma,
    } as unknown as PrismaService);
  });
  describe('find', () => {
    it('should look a payment up by one of its ledger entries, with the ledger', async () => {
      // Arrange
      // Act
      const actualPayment: Payment | undefined =
        await repository.findByTransactionId(TEST_IDS.CHARGE);
      // Assert
      expect(actualPayment).toBeUndefined();
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith({
        where: { transactions: { some: { id: TEST_IDS.CHARGE } } },
        include: {
          transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
    });
  });
  describe('saveNew', () => {
    it('should insert payment, charge and audit rows in one transaction', async () => {
      // Arrange
      const inputPayment: Payment = createTestPayment();
      // Act
      const actualResult: Result<void, DomainError> = await repository.saveNew({
        payment: inputPayment,
        auditEntries: [AUDIT_ENTRY],
      });
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: TEST_IDS.PAYMENT,
          totalAmount: 10,
          refundedAmount: 0,
          status: 'PENDING',
        }),
      });
      expect(
        mockTransaction.paymentTransaction.createMany,
      ).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            id: TEST_IDS.CHARGE,
            type: 'CHARGE',
            status: 'PENDING',
          }),
        ],
      });
      expect(mockTransaction.paymentAuditLog.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ action: 'STATE_CHANGED' })],
      });
    });
    it.each([
      'payments_order_id_key',
      'payment_transactions_idempotency_key_key',
    ])(
      'should report a DuplicatePaymentError on a violation of %s',
      async (inputIndex: string) => {
        // Arrange
        mockTransaction.payment.create.mockRejectedValue(
          createMockUniqueViolation(inputIndex),
        );
        // Act
        const actualResult: Result<void, DomainError> =
          await repository.saveNew({
            payment: createTestPayment(),
            auditEntries: [],
          });
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(DuplicatePaymentError);
      },
    );
  });
  describe('save', () => {
    it('should update the payment by version, finalise the PENDING charge only, and write audit and outbox rows', async () => {
      // Arrange
      const inputPayment: Payment = createTestPayment();
      inputPayment.applyTransactionResult({
        lookup: { transactionId: TEST_IDS.CHARGE },
        result: { status: 'SUCCESS', gatewayTxId: 'tx-1', amount: 10 },
      });
      // Act
      await repository.save({
        payment: inputPayment,
        auditEntries: [AUDIT_ENTRY],
      });
      // Assert
      expect(mockTransaction.payment.updateMany).toHaveBeenCalledWith({
        where: { id: TEST_IDS.PAYMENT, version: 1 },
        data: expect.objectContaining({
          status: 'PAID',
          refundedAmount: 0,
          version: { increment: 1 },
        }),
      });
      expect(
        mockTransaction.paymentTransaction.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: TEST_IDS.CHARGE, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'SUCCESS',
          gatewayTxId: 'tx-1',
        }),
      });
      expect(
        mockTransaction.paymentTransaction.createMany,
      ).toHaveBeenCalledWith({
        data: [],
      });
      expect(mockTransaction.outboxEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            eventType: 'payment.succeeded',
            aggregateId: TEST_IDS.PAYMENT,
          }),
        ],
      });
      expect(inputPayment.domainEvents).toEqual([]);
    });
    it('should insert a refund as a new entry and never rewrite the final charge', async () => {
      // Arrange
      const inputPayment: Payment = createTestPayment({ isPaid: true });
      mockTransaction.paymentTransaction.findMany.mockResolvedValue([
        { id: TEST_IDS.CHARGE, status: 'SUCCESS' },
      ]);
      inputPayment.applyRefund({
        transactionId: '0199a7c0-0000-7000-8000-0000000000e2',
        amount: inputPayment.totalAmount,
        gatewayTxId: 'rf-1',
        gateway: 'MOCK',
        channel: 'QR_CODE',
        idempotencyKey: 'refund:k',
      });
      // Act
      await repository.save({ payment: inputPayment, auditEntries: [] });
      // Assert
      expect(
        mockTransaction.paymentTransaction.updateMany,
      ).not.toHaveBeenCalled();
      expect(
        mockTransaction.paymentTransaction.createMany,
      ).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            type: 'REFUND',
            status: 'SUCCESS',
            gatewayTxId: 'rf-1',
          }),
        ],
      });
      expect(mockTransaction.outboxEvent.createMany).toHaveBeenCalledWith({
        data: [],
      });
    });
    it.each([
      {
        description: 'the payment version moved on',
        arrange: (transaction: MockTransactionClient): void => {
          transaction.payment.updateMany.mockResolvedValue({ count: 0 });
        },
      },
      {
        description: 'the charge is no longer PENDING in storage',
        arrange: (transaction: MockTransactionClient): void => {
          transaction.paymentTransaction.updateMany.mockResolvedValue({
            count: 0,
          });
        },
      },
      {
        description: 'a concurrent request stored the same ledger key',
        arrange: (transaction: MockTransactionClient): void => {
          transaction.paymentTransaction.updateMany.mockRejectedValue(
            createMockUniqueViolation(
              'payment_transactions_idempotency_key_key',
            ),
          );
        },
      },
    ])(
      'should throw a concurrency conflict when $description',
      async ({ arrange }) => {
        // Arrange
        arrange(mockTransaction);
        const inputPayment: Payment = createTestPayment();
        inputPayment.applyTransactionResult({
          lookup: { transactionId: TEST_IDS.CHARGE },
          result: { status: 'FAILED', gatewayTxId: 'tx-1' },
        });
        // Act
        const actualSave: Promise<void> = repository.save({
          payment: inputPayment,
          auditEntries: [],
        });
        // Assert
        await expect(actualSave).rejects.toBeInstanceOf(
          PaymentConcurrencyConflictError,
        );
        expect(inputPayment.domainEvents).not.toEqual([]);
      },
    );
  });
});
