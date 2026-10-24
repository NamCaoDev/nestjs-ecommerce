import { DomainError, Result } from '@org/shared-domain';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { InvalidPaymentStateError } from '../errors/invalid-payment-state.error';
import { PaymentStatus } from '../types/payment-status.type';
import { TransactionStatus } from '../types/transaction-status.type';
import { Money } from '../value-objects/money.vo';
import { OrderReference } from '../value-objects/order-reference.vo';
import { PaymentId } from '../value-objects/payment-id.vo';
import { Payment } from './payment.aggregate';

const CHARGE_ID = '0199a7c0-0000-7000-8000-0000000000e1';

/**
 * Builds a USD amount.
 */
const usd = (amount: number): Money =>
  Money.create({ amount, currency: 'USD' }).getValue();

/**
 * Restores a 10 USD payment in the given status, with one charge in the given status.
 */
const restorePayment = ({
  status,
  chargeStatus,
  refunded = 0,
}: {
  readonly status: PaymentStatus;
  readonly chargeStatus: TransactionStatus;
  readonly refunded?: number;
}): Payment =>
  Payment.restore({
    id: PaymentId.create('0199a7c0-0000-7000-8000-0000000000f1').getValue(),
    orderReference: OrderReference.create({
      orderId: '0199a7c0-0000-7000-8000-000000000001',
      customerId: '0199a7c0-0000-7000-8000-0000000000c1',
      lines: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 1 }],
    }).getValue(),
    totalAmount: usd(10),
    refundedAmount: usd(refunded),
    status,
    transactions: [
      PaymentTransaction.restore({
        id: CHARGE_ID,
        type: 'CHARGE',
        gateway: 'MOCK',
        channel: 'QR_CODE',
        amount: usd(10),
        status: chargeStatus,
        gatewayTxId: chargeStatus === 'PENDING' ? undefined : 'tx-1',
        idempotencyKey: 'charge:event-1',
      }),
    ],
    version: 1,
  });

/** One payment per status, with a ledger consistent with that status. */
const PAYMENTS_BY_STATUS: ReadonlyArray<{
  readonly status: PaymentStatus;
  readonly create: () => Payment;
}> = [
  {
    status: 'PENDING',
    create: (): Payment =>
      restorePayment({ status: 'PENDING', chargeStatus: 'PENDING' }),
  },
  {
    status: 'PAID',
    create: (): Payment =>
      restorePayment({ status: 'PAID', chargeStatus: 'SUCCESS' }),
  },
  {
    status: 'PARTIALLY_REFUNDED',
    create: (): Payment =>
      restorePayment({
        status: 'PARTIALLY_REFUNDED',
        chargeStatus: 'SUCCESS',
        refunded: 4,
      }),
  },
  {
    status: 'REFUNDED',
    create: (): Payment =>
      restorePayment({
        status: 'REFUNDED',
        chargeStatus: 'SUCCESS',
        refunded: 10,
      }),
  },
  {
    status: 'FAILED',
    create: (): Payment =>
      restorePayment({ status: 'FAILED', chargeStatus: 'FAILED' }),
  },
];

/**
 * Refunds 1 USD.
 */
const refundOne = (payment: Payment): Result<unknown, DomainError> =>
  payment.applyRefund({
    transactionId: '0199a7c0-0000-7000-8000-0000000000e2',
    amount: usd(1),
    gatewayTxId: 'rf-1',
    gateway: 'MOCK',
    channel: 'QR_CODE',
    idempotencyKey: 'refund:k',
  });

describe('Payment state machine', () => {
  it.each(
    PAYMENTS_BY_STATUS.map(({ status, create }) => ({
      status,
      create,
      expectedStatus:
        status === 'PAID' || status === 'PARTIALLY_REFUNDED'
          ? 'PARTIALLY_REFUNDED'
          : undefined,
    })),
  )(
    'should allow a partial refund of a $status payment only when it is PAID or PARTIALLY_REFUNDED',
    ({ status, create, expectedStatus }) => {
      // Arrange
      const payment: Payment = create();
      // Act
      const actualResult: Result<unknown, DomainError> = refundOne(payment);
      // Assert
      if (expectedStatus === undefined) {
        expect(actualResult.getError()).toBeInstanceOf(
          InvalidPaymentStateError,
        );
        expect(payment.status).toBe(status);
        return;
      }
      expect(actualResult.isSuccess).toBe(true);
      expect(payment.status).toBe(expectedStatus);
    },
  );
  it.each(PAYMENTS_BY_STATUS.filter(({ status }) => status !== 'PENDING'))(
    'should refuse to open a charge on a $status payment',
    ({ create }) => {
      // Arrange
      const payment: Payment = create();
      // Act
      const actualResult: Result<unknown, DomainError> = payment.initiateCharge(
        {
          transactionId: '0199a7c0-0000-7000-8000-0000000000e9',
          gateway: 'MOCK',
          channel: 'QR_CODE',
          idempotencyKey: 'charge:event-2',
        },
      );
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidPaymentStateError);
    },
  );
  it.each(['PAID', 'FAILED', 'REFUNDED'] as const)(
    'should refuse a charge result on a %s payment even if its ledger still shows a PENDING charge',
    (inputStatus: PaymentStatus) => {
      // Arrange
      const payment: Payment = restorePayment({
        status: inputStatus,
        chargeStatus: 'PENDING',
      });
      // Act
      const actualResult: Result<void, DomainError> =
        payment.applyTransactionResult({
          lookup: { transactionId: CHARGE_ID },
          result: { status: 'SUCCESS', gatewayTxId: 'tx-9', amount: 10 },
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidPaymentStateError);
      expect(payment.status).toBe(inputStatus);
      expect(
        payment.findTransaction({ transactionId: CHARGE_ID })?.status,
      ).toBe('PENDING');
      expect(payment.domainEvents).toEqual([]);
    },
  );
});
