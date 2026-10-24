import axios, { AxiosResponse } from 'axios';
import { SagaFixture } from '../support/saga/saga-fixture';
import { SagaInfrastructure } from '../support/saga/saga-infrastructure';

/**
 * Acceptance test of the checkout saga (choreography) across the order, inventory and payment services
 * and the real infrastructure:
 * POST /orders → ReserveStock (gRPC, Lua) → order.placed (outbox → Kafka) → payment PENDING →
 * signed MOCK webhook → payment PAID / FAILED, ledger entry finalised, activity log and
 * payment.succeeded / payment.failed (outbox → Kafka) → order CONFIRMED / CANCELLED and stock COMMITTED / RELEASED.
 *
 * Prerequisites: docker compose up, databases migrated; the three services are started by
 * `nx e2e payment-service-e2e`.
 */
const SCENARIO_TIMEOUT_MS = 180_000;

describe('Checkout saga: order → reservation → payment → webhook', () => {
  const infrastructure: SagaInfrastructure = new SagaInfrastructure();
  afterAll(async () => {
    await infrastructure.executeClose();
  });
  describe('when the gateway reports SUCCESS', () => {
    const fixture: SagaFixture = new SagaFixture(infrastructure);
    beforeAll(async () => {
      await fixture.saveStock();
    });
    afterAll(async () => {
      await fixture.executeCleanUp();
    });
    it(
      'should confirm the order and commit the stock',
      async () => {
        // Given a SKU with 10 units in stock
        // When the customer places an order for 2 units
        const actualOrderResponse: AxiosResponse<{ orderId: string }> =
          await fixture.executePlaceOrder();
        // Then the order is accepted and the stock is reserved
        expect(actualOrderResponse.status).toBe(201);
        expect(await fixture.findReservationStatus()).toBe('RESERVED');
        // And the payment service opens a PENDING payment with a PENDING charge and a QR code to pay
        const actualPendingPayment: Record<string, unknown> =
          await fixture.waitForPayment('PENDING');
        expect(actualPendingPayment).toMatchObject({
          orderId: fixture.orderId,
          customerId: fixture.customerId,
          totalAmount: 10,
          refundedAmount: 0,
          currency: 'USD',
          clientAction: { type: 'QR_CODE' },
          transactions: [
            { type: 'CHARGE', gateway: 'MOCK', status: 'PENDING', amount: 10 },
          ],
        });
        // And the stock is still only reserved while the customer pays
        expect(await fixture.findReservationStatus()).toBe('RESERVED');
        // When the gateway reports the payment as successful
        const actualWebhookResponse: AxiosResponse<{ status: string }> =
          await axios.post('/api/payments/mock-gateway/pay', {
            orderId: fixture.orderId,
            status: 'SUCCESS',
          });
        expect(actualWebhookResponse.status).toBe(200);
        // Then the payment is PAID, its charge SUCCESS, and payment.succeeded is in its outbox
        const actualPaidPayment: Record<string, unknown> =
          await fixture.waitForPayment('PAID');
        expect(actualPaidPayment['transactions']).toEqual([
          expect.objectContaining({
            status: 'SUCCESS',
            gatewayTxId: expect.stringMatching(/^mock_tx_/),
          }),
        ]);
        expect(await fixture.findPaymentOutboxEvents()).toEqual([
          'payment.succeeded',
        ]);
        // And every step is in the activity log
        expect(await fixture.findActivityActions()).toEqual([
          'PAYMENT_INITIATED',
          'TRANSACTION_FINALIZED',
          'STATE_CHANGED',
        ]);
        // And the order is CONFIRMED
        expect(await fixture.waitForOrderStatus('CONFIRMED')).toBe('CONFIRMED');
        // And the stock is COMMITTED: it left the warehouse in Redis and in the ledger
        expect(await fixture.waitForLedger(['RESERVED', 'COMMITTED'])).toEqual([
          'RESERVED',
          'COMMITTED',
        ]);
        expect(await fixture.findReservationStatus()).toBe('COMMITTED');
        expect(await fixture.findRedisStock()).toEqual({
          total: String(fixture.stockTotal - fixture.orderedQuantity),
          reserved: '0',
        });
      },
      SCENARIO_TIMEOUT_MS,
    );
  });
  describe('when the gateway reports FAILURE', () => {
    const fixture: SagaFixture = new SagaFixture(infrastructure);
    beforeAll(async () => {
      await fixture.saveStock();
    });
    afterAll(async () => {
      await fixture.executeCleanUp();
    });
    it(
      'should cancel the order and release the stock at once',
      async () => {
        // Given an order for 2 units whose payment is PENDING
        await fixture.executePlaceOrder();
        await fixture.waitForPayment('PENDING');
        // When the gateway reports the payment as declined
        await axios.post('/api/payments/mock-gateway/pay', {
          orderId: fixture.orderId,
          status: 'FAILED',
          failureReason: 'CARD_DECLINED',
        });
        // Then the payment is FAILED with the gateway reason
        const actualPayment: Record<string, unknown> =
          await fixture.waitForPayment('FAILED');
        expect(actualPayment['transactions']).toEqual([
          expect.objectContaining({
            status: 'FAILED',
            failureReason: 'CARD_DECLINED',
          }),
        ]);
        // And the order is CANCELLED
        expect(await fixture.waitForOrderStatus('CANCELLED')).toBe('CANCELLED');
        // And the reserved units are released without waiting for the reservation to expire
        expect(await fixture.waitForLedger(['RESERVED', 'RELEASED'])).toEqual([
          'RESERVED',
          'RELEASED',
        ]);
        expect(await fixture.findReservationStatus()).toBeNull();
        expect(await fixture.findRedisStock()).toEqual({
          total: String(fixture.stockTotal),
          reserved: '0',
        });
      },
      SCENARIO_TIMEOUT_MS,
    );
  });
});
