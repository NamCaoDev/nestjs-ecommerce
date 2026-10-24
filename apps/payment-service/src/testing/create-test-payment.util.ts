import { Payment } from '../domain/aggregates/payment.aggregate';
import { Money } from '../domain/value-objects/money.vo';
import { OrderReference } from '../domain/value-objects/order-reference.vo';
import { PaymentId } from '../domain/value-objects/payment-id.vo';
import { TEST_IDS } from './test-ids';

/**
 * Builds a payment of 10 USD for unit tests: PENDING with a PENDING MOCK charge, or PAID.
 *
 * @param input - Whether the charge succeeded.
 * @returns The payment, events cleared.
 */
export function createTestPayment({
  isPaid = false,
}: { readonly isPaid?: boolean } = {}): Payment {
  const payment: Payment = Payment.create({
    id: PaymentId.create(TEST_IDS.PAYMENT).getValue(),
    orderReference: OrderReference.create({
      orderId: TEST_IDS.ORDER,
      customerId: TEST_IDS.CUSTOMER,
      lines: [{ skuId: TEST_IDS.SKU, quantity: 2 }],
    }).getValue(),
    totalAmount: Money.create({ amount: 10, currency: 'USD' }).getValue(),
  }).getValue();
  payment.initiateCharge({
    transactionId: TEST_IDS.CHARGE,
    gateway: 'MOCK',
    channel: 'QR_CODE',
    idempotencyKey: 'charge:event-1',
    rawGatewayResponse: { clientAction: { type: 'QR_CODE', qrContent: 'qr' } },
  });
  if (isPaid) {
    payment.applyTransactionResult({
      lookup: { transactionId: TEST_IDS.CHARGE },
      result: { status: 'SUCCESS', gatewayTxId: 'tx-1', amount: 10 },
    });
  }
  payment.clearEvents();
  return payment;
}
