import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'node:crypto';
import { CheckoutInfrastructure } from '../support/checkout/checkout-infrastructure';
import { waitUntil } from '../support/checkout/wait-until.util';

/**
 * Acceptance test of the order side of checkout across order and inventory services and the real
 * infrastructure: POST /orders → gRPC ReserveStock (Lua) → order + outbox in one transaction → outbox
 * relay → Kafka `orders.events`. The stock stays RESERVED (scheduled for expiry) until the payment
 * saga commits or releases it; that part is covered by `payment-service-e2e`.
 *
 * Prerequisites: docker compose up; inventory-service and order-service are started by
 * `nx e2e order-service-e2e`.
 */
const STOCK_TOTAL = 10;
const ORDERED_QUANTITY = 2;
/**
 * Budget for the asynchronous flow. Above the Kafka session timeout (~30 s): when a previous inventory
 * instance was killed (e.g. by another suite's teardown), the consumer group only reassigns partitions
 * once that member's session expires.
 */
const FLOW_TIMEOUT_MS = 45_000;

/** Jest timeout of the flow test: the wait plus the HTTP calls. */
const TEST_TIMEOUT_MS = FLOW_TIMEOUT_MS + 15_000;
const EXPIRATIONS_KEY = 'inventory:reservation_expirations';

describe('Checkout: stock is reserved until the order is paid', () => {
  const infrastructure: CheckoutInfrastructure = new CheckoutInfrastructure();
  const skuId: string = randomUUID();
  const customerId: string = randomUUID();
  const idempotencyKey: string = `e2e-${randomUUID()}`;
  const reservationKey: string = `${customerId}:${idempotencyKey}`;
  let orderId: string = '';
  beforeAll(async () => {
    await infrastructure.inventoryDb.query(
      'INSERT INTO inventory_stocks (sku_id, total_quantity, reserved_quantity, updated_at) VALUES ($1, $2, 0, now())',
      [skuId, STOCK_TOTAL],
    );
    await infrastructure.redis.hset(`inventory:stock:${skuId}`, {
      total: STOCK_TOTAL,
      reserved: 0,
    });
  });
  afterAll(async () => {
    await infrastructure.orderDb.query(
      'DELETE FROM outbox_events WHERE aggregate_id = $1',
      [orderId || randomUUID()],
    );
    await infrastructure.orderDb.query(
      'DELETE FROM orders WHERE customer_id = $1',
      [customerId],
    );
    await infrastructure.inventoryDb.query(
      'DELETE FROM stock_ledger WHERE sku_id = $1',
      [skuId],
    );
    await infrastructure.inventoryDb.query(
      'DELETE FROM inventory_stocks WHERE sku_id = $1',
      [skuId],
    );
    await infrastructure.redis.zrem(EXPIRATIONS_KEY, reservationKey);
    await infrastructure.redis.del(
      `inventory:stock:${skuId}`,
      `inventory:reservation:${reservationKey}`,
      `inventory:reservation_order:${orderId}`,
      `idempotency:order:${customerId}:${idempotencyKey}`,
    );
    await infrastructure.executeClose();
  });
  it(
    'should reserve the stock, publish order.placed and keep the reservation until payment',
    async () => {
      // Given a SKU with 10 units in stock
      // When the customer places an order for 2 units
      const actualResponse: AxiosResponse<{ orderId: string }> =
        await axios.post(
          '/api/orders',
          {
            customerId,
            currency: 'USD',
            items: [
              {
                skuId,
                productName: 'e2e item',
                quantity: ORDERED_QUANTITY,
                unitPrice: 5,
              },
            ],
            shippingAddress: {
              recipientName: 'E2E',
              phoneNumber: '+84900000000',
              line1: '1 Le Loi',
              city: 'HCMC',
              postalCode: '700000',
              countryCode: 'VN',
            },
          },
          { headers: { 'Idempotency-Key': idempotencyKey } },
        );
      orderId = actualResponse.data.orderId;
      // Then the order is accepted and its order.placed event is relayed to Kafka
      expect(actualResponse.status).toBe(201);
      const actualOutboxStatus: string = await waitUntil({
        description: 'the order.placed outbox row to be PUBLISHED',
        timeoutMs: FLOW_TIMEOUT_MS,
        probe: async (): Promise<string | undefined> => {
          const result: { rows: { status: string }[] } =
            await infrastructure.orderDb.query(
              "SELECT status FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'order.placed'",
              [orderId],
            );
          return result.rows[0]?.status === 'PUBLISHED'
            ? 'PUBLISHED'
            : undefined;
        },
      });
      expect(actualOutboxStatus).toBe('PUBLISHED');
      // And the stock stays reserved, scheduled for expiry, until the payment outcome is known
      const actualReservationStatus: string | null =
        await infrastructure.redis.hget(
          `inventory:reservation:${reservationKey}`,
          'status',
        );
      expect(actualReservationStatus).toBe('RESERVED');
      const actualExpiryScore: string | null =
        await infrastructure.redis.zscore(EXPIRATIONS_KEY, reservationKey);
      expect(actualExpiryScore).not.toBeNull();
      const actualRedisStock: Record<string, string> =
        await infrastructure.redis.hgetall(`inventory:stock:${skuId}`);
      expect(actualRedisStock).toEqual({
        total: String(STOCK_TOTAL),
        reserved: String(ORDERED_QUANTITY),
      });
      // And the ledger records the reservation only
      const actualLedger: {
        rows: { action_type: string; quantity_changed: number }[];
      } = await infrastructure.inventoryDb.query(
        'SELECT action_type, quantity_changed FROM stock_ledger WHERE sku_id = $1 AND order_id = $2 ORDER BY created_at',
        [skuId, orderId],
      );
      expect(actualLedger.rows).toEqual([
        { action_type: 'RESERVED', quantity_changed: ORDERED_QUANTITY },
      ]);
    },
    TEST_TIMEOUT_MS,
  );
});
