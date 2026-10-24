import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { TEST_IDS } from '../../../testing/test-ids';
import { Prisma } from '../prisma/generated/client';
import { PaymentPersistenceMapper } from './payment-persistence.mapper';
import { PaymentWithTransactionsRecord } from './payment-with-transactions.record';

const RECORD: PaymentWithTransactionsRecord = {
  id: TEST_IDS.PAYMENT,
  orderId: TEST_IDS.ORDER,
  customerId: TEST_IDS.CUSTOMER,
  totalAmount: new Prisma.Decimal('10.0000'),
  refundedAmount: new Prisma.Decimal('4.5000'),
  currency: 'USD',
  status: 'PARTIALLY_REFUNDED',
  lineItems: [{ skuId: TEST_IDS.SKU, quantity: 2 }],
  version: 3,
  createdAt: new Date(1_000),
  updatedAt: new Date(3_000),
  transactions: [
    {
      id: TEST_IDS.CHARGE,
      paymentId: TEST_IDS.PAYMENT,
      type: 'CHARGE',
      gateway: 'MOCK',
      channel: 'QR_CODE',
      gatewayTxId: 'tx-1',
      amount: new Prisma.Decimal('10.0000'),
      status: 'SUCCESS',
      failureReason: null,
      idempotencyKey: 'charge:event-1',
      rawGatewayResponse: { status: 'SUCCESS' },
      createdAt: new Date(1_000),
    },
  ],
};

describe('PaymentPersistenceMapper', () => {
  it('should rebuild the aggregate and its ledger from rows', () => {
    // Arrange
    const inputRecord: PaymentWithTransactionsRecord = RECORD;
    // Act
    const actualPayment: Payment =
      PaymentPersistenceMapper.toDomain(inputRecord);
    // Assert
    expect(actualPayment.status).toBe('PARTIALLY_REFUNDED');
    expect(actualPayment.totalAmount.amount).toBe(10);
    expect(actualPayment.refundedAmount.amount).toBe(4.5);
    expect(actualPayment.version).toBe(3);
    expect(actualPayment.transactions[0]).toMatchObject({
      id: TEST_IDS.CHARGE,
      status: 'SUCCESS',
      gatewayTxId: 'tx-1',
      failureReason: undefined,
      rawGatewayResponse: { status: 'SUCCESS' },
    });
  });
  it('should write a ledger entry with SQL NULL for absent outcome fields', () => {
    // Arrange
    const inputPayment: Payment = PaymentPersistenceMapper.toDomain({
      ...RECORD,
      transactions: [
        {
          ...RECORD.transactions[0],
          status: 'PENDING',
          gatewayTxId: null,
          rawGatewayResponse: null,
        },
      ],
    });
    // Act
    const actualRow: Prisma.PaymentTransactionCreateManyInput =
      PaymentPersistenceMapper.toTransactionRow({
        paymentId: TEST_IDS.PAYMENT,
        transaction: inputPayment.transactions[0],
      });
    // Assert
    expect(actualRow).toMatchObject({
      status: 'PENDING',
      gatewayTxId: null,
      failureReason: null,
      rawGatewayResponse: Prisma.DbNull,
      amount: 10,
    });
  });
});
