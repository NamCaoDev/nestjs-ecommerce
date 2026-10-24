import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'node:crypto';
import { CheckoutInfrastructure } from '../support/checkout/checkout-infrastructure';
import { waitUntil } from '../support/checkout/wait-until.util';

/**
 * Acceptance test of the full checkout flow across both services and the real infrastructure:
 * POST /orders → gRPC ReserveStock (Lua) → order + outbox in one transaction → outbox relay →
 * Kafka `orders.events` → inventory consumer → atomic_commit.lua → COMMITTED ledger entry.
 *
 * Prerequisites: docker compose up, inventory-service running (gRPC 50051); order-service is
 * started by `nx e2e order-service-e2e`.
 */
const STOCK_TOTAL = 10;
const ORDERED_QUANTITY = 2;
const FLOW_TIMEOUT_MS = 20_000;
const EXPIRATIONS_KEY = 'inventory:reservation_expirations';

describe('Checkout: reservation is committed through Kafka', () => {
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
    await infrastructure.redis.del(
      `inventory:stock:${skuId}`,
      `inventory:reservation:${reservationKey}`,
      `inventory:reservation_order:${orderId}`,
      `idempotency:order:${customerId}:${idempotencyKey}`,
    );
    await infrastructure.executeClose();
  });
  it('should reserve, publish order.placed, then commit the reservation and remove it from the expiry queue', async () => {
    // Given a SKU with 10 units in stock
    // When the customer places an order for 2 units
    const actualResponse: AxiosResponse<{ orderId: string }> = await axios.post(
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
        return result.rows[0]?.status === 'PUBLISHED' ? 'PUBLISHED' : undefined;
      },
    });
    expect(actualOutboxStatus).toBe('PUBLISHED');
    // And the inventory consumer commits the reservation
    const actualReservationStatus: string = await waitUntil({
      description: 'the reservation to be COMMITTED',
      timeoutMs: FLOW_TIMEOUT_MS,
      probe: async (): Promise<string | undefined> => {
        const status: string | null = await infrastructure.redis.hget(
          `inventory:reservation:${reservationKey}`,
          'status',
        );
        return status === 'COMMITTED' ? status : undefined;
      },
    });
    expect(actualReservationStatus).toBe('COMMITTED');
    // And the reservation is no longer scheduled for expiry
    const actualExpiryScore: string | null = await infrastructure.redis.zscore(
      EXPIRATIONS_KEY,
      reservationKey,
    );
    expect(actualExpiryScore).toBeNull();
    // And the stock has left the warehouse in Redis and PostgreSQL
    const actualRedisStock: Record<string, string> =
      await infrastructure.redis.hgetall(`inventory:stock:${skuId}`);
    expect(actualRedisStock).toEqual({
      total: String(STOCK_TOTAL - ORDERED_QUANTITY),
      reserved: '0',
    });
    const actualDbStock: {
      rows: { total_quantity: number; reserved_quantity: number }[];
    } = await infrastructure.inventoryDb.query(
      'SELECT total_quantity, reserved_quantity FROM inventory_stocks WHERE sku_id = $1',
      [skuId],
    );
    expect(actualDbStock.rows[0]).toEqual({
      total_quantity: STOCK_TOTAL - ORDERED_QUANTITY,
      reserved_quantity: 0,
    });
    // And the ledger records the reservation and its commit for this order
    const actualLedger: {
      rows: { action_type: string; quantity_changed: number }[];
    } = await infrastructure.inventoryDb.query(
      'SELECT action_type, quantity_changed FROM stock_ledger WHERE sku_id = $1 AND order_id = $2 ORDER BY created_at',
      [skuId, orderId],
    );
    expect(actualLedger.rows).toEqual([
      { action_type: 'RESERVED', quantity_changed: ORDERED_QUANTITY },
      { action_type: 'COMMITTED', quantity_changed: -ORDERED_QUANTITY },
    ]);
  });
});
