import { DomainEvent } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { createTestPayment } from '../../../testing/create-test-payment.util';
import { TEST_IDS } from '../../../testing/test-ids';
import { Prisma } from '../prisma/generated/client';
import { OutboxEventMapper } from './outbox-event.mapper';

/**
 * Applies a charge result to a fresh payment and returns its pending events.
 */
const createResultEvents = (
  status: 'SUCCESS' | 'FAILED',
): readonly DomainEvent[] => {
  const payment: Payment = createTestPayment();
  payment.applyTransactionResult({
    lookup: { transactionId: TEST_IDS.CHARGE },
    result: { status, gatewayTxId: 'tx-1', failureReason: 'CARD_DECLINED' },
  });
  return payment.domainEvents;
};

describe('OutboxEventMapper', () => {
  it('should publish payment.succeeded with the order lines when the payment becomes PAID', () => {
    // Arrange
    const inputEvents: readonly DomainEvent[] = createResultEvents('SUCCESS');
    // Act
    const actualRows: Prisma.OutboxEventCreateManyInput[] =
      OutboxEventMapper.toCreateInputs(inputEvents);
    // Assert
    expect(actualRows).toHaveLength(1);
    expect(actualRows[0]).toMatchObject({
      aggregateType: 'Payment',
      aggregateId: TEST_IDS.PAYMENT,
      eventType: 'payment.succeeded',
      payload: {
        paymentId: TEST_IDS.PAYMENT,
        orderId: TEST_IDS.ORDER,
        amount: 10,
        currency: 'USD',
        gatewayTxId: 'tx-1',
        items: [{ skuId: TEST_IDS.SKU, quantity: 2 }],
      },
    });
  });
  it('should publish payment.failed with the reason when the payment becomes FAILED', () => {
    // Arrange
    const inputEvents: readonly DomainEvent[] = createResultEvents('FAILED');
    // Act
    const actualRows: Prisma.OutboxEventCreateManyInput[] =
      OutboxEventMapper.toCreateInputs(inputEvents);
    // Assert
    expect(actualRows[0]).toMatchObject({
      eventType: 'payment.failed',
      payload: { orderId: TEST_IDS.ORDER, reason: 'CARD_DECLINED' },
    });
  });
  it('should keep initiation and refunds internal', () => {
    // Arrange
    const payment: Payment = createTestPayment({ isPaid: true });
    payment.applyRefund({
      transactionId: '0199a7c0-0000-7000-8000-0000000000e2',
      amount: payment.totalAmount,
      gatewayTxId: 'rf-1',
      gateway: 'MOCK',
      channel: 'QR_CODE',
      idempotencyKey: 'refund:k',
    });
    // Act
    const actualRows: Prisma.OutboxEventCreateManyInput[] =
      OutboxEventMapper.toCreateInputs(payment.domainEvents);
    // Assert
    expect(actualRows).toEqual([]);
  });
});
