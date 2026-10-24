import { DomainError, Result } from '@org/shared-domain';
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
import { Money } from '../value-objects/money.vo';
import { OrderReference } from '../value-objects/order-reference.vo';
import { PaymentId } from '../value-objects/payment-id.vo';
import { ApplyRefundInput } from './apply-refund.input';
import { Payment } from './payment.aggregate';

const PAYMENT_ID = '0199a7c0-0000-7000-8000-0000000000f1';
const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const CHARGE_ID = '0199a7c0-0000-7000-8000-0000000000e1';
const LINES = [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 2 }];

/**
 * Builds a USD amount.
 */
const usd = (amount: number): Money =>
  Money.create({ amount, currency: 'USD' }).getValue();

/**
 * Creates a PENDING payment of 10 USD with its PENDING charge, events cleared.
 */
const createPendingPayment = (): Payment => {
  const payment: Payment = Payment.create({
    id: PaymentId.create(PAYMENT_ID).getValue(),
    orderReference: OrderReference.create({
      orderId: ORDER_ID,
      customerId: '0199a7c0-0000-7000-8000-0000000000c1',
      lines: LINES,
    }).getValue(),
    totalAmount: usd(10),
  }).getValue();
  payment.initiateCharge({
    transactionId: CHARGE_ID,
    gateway: 'MOCK',
    channel: 'QR_CODE',
    idempotencyKey: 'charge:event-1',
  });
  payment.clearEvents();
  return payment;
};

/**
 * Creates a PAID payment of 10 USD, events cleared.
 */
const createPaidPayment = (): Payment => {
  const payment: Payment = createPendingPayment();
  payment.applyTransactionResult({
    lookup: { transactionId: CHARGE_ID },
    result: { status: 'SUCCESS', gatewayTxId: 'tx-1', amount: 10 },
  });
  payment.clearEvents();
  return payment;
};

/**
 * Builds a refund request of the given amount.
 */
const createRefundInput = (
  amount: number,
  transactionId: string = '0199a7c0-0000-7000-8000-0000000000e2',
): ApplyRefundInput => ({
  transactionId,
  amount: usd(amount),
  gatewayTxId: `rf-${transactionId.slice(-2)}`,
  gateway: 'MOCK',
  channel: 'QR_CODE',
  idempotencyKey: `refund:${transactionId}`,
  rawResponse: { refundId: 'rf' },
});

describe('Payment', () => {
  describe('create', () => {
    it('should refuse a total that is not positive', () => {
      // Arrange
      // Act
      const actualResult: Result<Payment, DomainError> = Payment.create({
        id: PaymentId.create(PAYMENT_ID).getValue(),
        orderReference: createPendingPayment().orderReference,
        totalAmount: Money.zero('USD'),
      });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidMoneyError);
    });
  });
  describe('initiateCharge', () => {
    it('should open a PENDING charge of the total and raise PaymentInitiatedDomainEvent', () => {
      // Arrange
      const payment: Payment = Payment.create({
        id: PaymentId.create(PAYMENT_ID).getValue(),
        orderReference: createPendingPayment().orderReference,
        totalAmount: usd(10),
      }).getValue();
      // Act
      const actualResult: Result<PaymentTransaction, DomainError> =
        payment.initiateCharge({
          transactionId: CHARGE_ID,
          gateway: 'VNPAY',
          channel: 'DOMESTIC_BANK',
          idempotencyKey: 'charge:event-1',
          rawGatewayResponse: { clientAction: { type: 'REDIRECT' } },
        });
      // Assert
      expect(actualResult.getValue()).toMatchObject({
        type: 'CHARGE',
        status: 'PENDING',
        gateway: 'VNPAY',
        amount: usd(10),
      });
      expect(payment.status).toBe('PENDING');
      expect(payment.domainEvents).toHaveLength(1);
      expect(payment.domainEvents[0]).toBeInstanceOf(
        PaymentInitiatedDomainEvent,
      );
      expect(payment.domainEvents[0]).toMatchObject({
        aggregateId: PAYMENT_ID,
        transactionId: CHARGE_ID,
        amount: 10,
      });
    });
    it('should refuse a second charge while one is open', () => {
      // Arrange
      const payment: Payment = createPendingPayment();
      // Act
      const actualResult: Result<PaymentTransaction, DomainError> =
        payment.initiateCharge({
          transactionId: '0199a7c0-0000-7000-8000-0000000000e9',
          gateway: 'MOCK',
          channel: 'QR_CODE',
          idempotencyKey: 'charge:event-2',
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidPaymentStateError);
    });
  });
  describe('applyTransactionResult', () => {
    it('should finalise the charge, mark the payment PAID and raise both events', () => {
      // Arrange
      const payment: Payment = createPendingPayment();
      // Act
      const actualResult: Result<void, DomainError> =
        payment.applyTransactionResult({
          lookup: { transactionId: CHARGE_ID },
          result: { status: 'SUCCESS', gatewayTxId: 'tx-1', amount: 10 },
        });
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(payment.status).toBe('PAID');
      expect(payment.findTransaction({ gatewayTxId: 'tx-1' })?.id).toBe(
        CHARGE_ID,
      );
      expect(payment.domainEvents.map((event) => event.constructor)).toEqual([
        PaymentTransactionFinalizedDomainEvent,
        PaymentStatusChangedDomainEvent,
      ]);
      expect(payment.domainEvents[1]).toMatchObject({
        from: 'PENDING',
        to: 'PAID',
        gatewayTxId: 'tx-1',
        totalAmount: 10,
        lines: LINES,
      });
    });
    it.each(['FAILED', 'CANCELLED'] as const)(
      'should mark the payment FAILED on a %s charge',
      (inputStatus: 'FAILED' | 'CANCELLED') => {
        // Arrange
        const payment: Payment = createPendingPayment();
        // Act
        payment.applyTransactionResult({
          lookup: { transactionId: CHARGE_ID },
          result: {
            status: inputStatus,
            gatewayTxId: 'tx-1',
            failureReason: 'CARD_DECLINED',
          },
        });
        // Assert
        expect(payment.status).toBe('FAILED');
        expect(payment.domainEvents[1]).toMatchObject({
          to: 'FAILED',
          failureReason: 'CARD_DECLINED',
        });
      },
    );
    it('should refuse to apply a result to a charge that is already final', () => {
      // Arrange
      const payment: Payment = createPaidPayment();
      // Act
      const actualResult: Result<void, DomainError> =
        payment.applyTransactionResult({
          lookup: { transactionId: CHARGE_ID },
          result: { status: 'FAILED', gatewayTxId: 'tx-2' },
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        TransactionAlreadyFinalizedError,
      );
      expect(payment.status).toBe('PAID');
      expect(payment.domainEvents).toEqual([]);
    });
    it('should refuse a success reporting another amount', () => {
      // Arrange
      const payment: Payment = createPendingPayment();
      // Act
      const actualResult: Result<void, DomainError> =
        payment.applyTransactionResult({
          lookup: { transactionId: CHARGE_ID },
          result: { status: 'SUCCESS', gatewayTxId: 'tx-1', amount: 1 },
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(AmountMismatchError);
      expect(
        payment.findTransaction({ transactionId: CHARGE_ID })?.status,
      ).toBe('PENDING');
    });
    it('should report an unknown charge', () => {
      // Arrange
      const payment: Payment = createPendingPayment();
      // Act
      const actualResult: Result<void, DomainError> =
        payment.applyTransactionResult({
          lookup: { gatewayTxId: 'unknown' },
          result: { status: 'SUCCESS', gatewayTxId: 'tx-1' },
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(TransactionNotFoundError);
    });
  });
  describe('applyRefund', () => {
    it('should keep totalAmount, raise refundedAmount and become PARTIALLY_REFUNDED on a partial refund', () => {
      // Arrange
      const payment: Payment = createPaidPayment();
      // Act
      const actualResult: Result<PaymentTransaction, DomainError> =
        payment.applyRefund(createRefundInput(4.5));
      // Assert
      expect(actualResult.getValue()).toMatchObject({
        type: 'REFUND',
        status: 'SUCCESS',
        amount: usd(4.5),
      });
      expect(payment.totalAmount).toEqual(usd(10));
      expect(payment.refundedAmount).toEqual(usd(4.5));
      expect(payment.status).toBe('PARTIALLY_REFUNDED');
      expect(payment.domainEvents[1]).toMatchObject({
        from: 'PAID',
        to: 'PARTIALLY_REFUNDED',
        totalAmount: 10,
        refundedAmount: 4.5,
      });
    });
    it('should become REFUNDED once the refunds reach the total', () => {
      // Arrange
      const payment: Payment = createPaidPayment();
      payment.applyRefund(createRefundInput(4.5));
      // Act
      payment.applyRefund(
        createRefundInput(5.5, '0199a7c0-0000-7000-8000-0000000000e3'),
      );
      // Assert
      expect(payment.status).toBe('REFUNDED');
      expect(payment.refundedAmount).toEqual(usd(10));
      expect(payment.totalAmount).toEqual(usd(10));
      expect(
        payment.transactions.filter((entry) => entry.type === 'REFUND'),
      ).toHaveLength(2);
    });
    it('should refuse refunds above the total', () => {
      // Arrange
      const payment: Payment = createPaidPayment();
      payment.applyRefund(createRefundInput(6));
      // Act
      const actualResult: Result<PaymentTransaction, DomainError> =
        payment.applyRefund(
          createRefundInput(4.0001, '0199a7c0-0000-7000-8000-0000000000e3'),
        );
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(RefundExceedsTotalError);
      expect(actualResult.getError().message).toContain('refundable 4 USD');
      expect(payment.refundedAmount).toEqual(usd(6));
    });
    it.each([
      { description: 'PENDING', createPayment: createPendingPayment },
      {
        description: 'REFUNDED',
        createPayment: (): Payment => {
          const payment: Payment = createPaidPayment();
          payment.applyRefund(createRefundInput(10));
          return payment;
        },
      },
    ])(
      'should refuse to refund a $description payment',
      ({ createPayment }) => {
        // Arrange
        const payment: Payment = createPayment();
        // Act
        const actualResult: Result<void, DomainError> = payment.checkRefund(
          usd(1),
        );
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(
          InvalidPaymentStateError,
        );
      },
    );
    it('should refuse a refund in another currency', () => {
      // Arrange
      const payment: Payment = createPaidPayment();
      // Act
      const actualResult: Result<void, DomainError> = payment.checkRefund(
        Money.create({ amount: 1, currency: 'EUR' }).getValue(),
      );
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidMoneyError);
    });
  });
});
