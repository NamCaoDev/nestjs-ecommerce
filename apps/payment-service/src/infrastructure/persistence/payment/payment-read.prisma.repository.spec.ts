import { PaymentActivityReadModel } from '../../../application/read-models/payment-activity.read-model';
import { PaymentReadModel } from '../../../application/read-models/payment.read-model';
import { TEST_IDS } from '../../../testing/test-ids';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentReadPrismaRepository } from './payment-read.prisma.repository';

/** Pending payment row with its charge. */
const PAYMENT_ROW = {
  id: TEST_IDS.PAYMENT,
  orderId: TEST_IDS.ORDER,
  customerId: TEST_IDS.CUSTOMER,
  totalAmount: new Prisma.Decimal('10.0000'),
  refundedAmount: new Prisma.Decimal('0'),
  currency: 'USD',
  status: 'PENDING',
  lineItems: [],
  version: 1,
  createdAt: new Date(1_000),
  updatedAt: new Date(1_000),
  transactions: [
    {
      id: TEST_IDS.CHARGE,
      type: 'CHARGE',
      gateway: 'MOCK',
      channel: 'QR_CODE',
      status: 'PENDING',
      amount: new Prisma.Decimal('10.0000'),
      gatewayTxId: null,
      failureReason: null,
      rawGatewayResponse: {
        clientAction: { type: 'QR_CODE', qrContent: 'qr' },
      },
      createdAt: new Date(1_000),
    },
  ],
};

describe('PaymentReadPrismaRepository', () => {
  let mockClient: {
    readonly $transaction: jest.Mock;
    readonly payment: {
      readonly findUnique: jest.Mock;
      readonly count: jest.Mock;
    };
    readonly paymentAuditLog: { readonly findMany: jest.Mock };
    readonly paymentTransaction: { readonly findUnique: jest.Mock };
  };
  let repository: PaymentReadPrismaRepository;
  beforeEach(() => {
    mockClient = {
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
      payment: {
        findUnique: jest.fn().mockResolvedValue(PAYMENT_ROW),
        count: jest.fn().mockResolvedValue(1),
      },
      paymentAuditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            paymentId: TEST_IDS.PAYMENT,
            transactionId: TEST_IDS.CHARGE,
            action: 'PAYMENT_INITIATED',
            actorType: 'SYSTEM',
            actorId: null,
            stateFrom: null,
            stateTo: 'PENDING',
            payload: { amount: 10 },
            ipAddress: null,
            createdAt: new Date(1_000),
          },
        ]),
      },
      paymentTransaction: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ paymentId: TEST_IDS.PAYMENT }),
      },
    };
    repository = new PaymentReadPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  it('should expose the client action of the pending charge with the ledger', async () => {
    // Arrange
    // Act
    const actualPayment: PaymentReadModel | undefined =
      await repository.findByOrderId(TEST_IDS.ORDER);
    // Assert
    expect(actualPayment).toMatchObject({
      paymentId: TEST_IDS.PAYMENT,
      status: 'PENDING',
      totalAmount: 10,
      refundedAmount: 0,
      clientAction: { type: 'QR_CODE', qrContent: 'qr' },
      transactions: [
        { transactionId: TEST_IDS.CHARGE, status: 'PENDING', amount: 10 },
      ],
    });
  });
  it('should read the activity log oldest first', async () => {
    // Arrange
    // Act
    const actualActivities: readonly PaymentActivityReadModel[] | undefined =
      await repository.findActivities(TEST_IDS.PAYMENT);
    // Assert
    expect(mockClient.paymentAuditLog.findMany).toHaveBeenCalledWith({
      where: { paymentId: TEST_IDS.PAYMENT },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(actualActivities).toEqual([
      expect.objectContaining({
        activityId: 'a1',
        action: 'PAYMENT_INITIATED',
        stateTo: 'PENDING',
        createdAt: 1_000,
      }),
    ]);
  });
  it('should return undefined activities for an unknown payment', async () => {
    // Arrange
    mockClient.payment.count.mockResolvedValue(0);
    // Act
    const actualActivities: readonly PaymentActivityReadModel[] | undefined =
      await repository.findActivities(TEST_IDS.PAYMENT);
    // Assert
    expect(actualActivities).toBeUndefined();
  });
  it('should resolve the payment of a ledger entry', async () => {
    // Arrange
    // Act
    const actualPaymentId: string | undefined =
      await repository.findPaymentIdByTransactionId(TEST_IDS.CHARGE);
    // Assert
    expect(actualPaymentId).toBe(TEST_IDS.PAYMENT);
  });
});
