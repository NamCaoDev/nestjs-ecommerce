import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'node:crypto';
import { CheckoutInfrastructure } from '../support/checkout/checkout-infrastructure';
import { PaymentEventsProducer } from '../support/payments/payment-events.producer';
import { PublishedMessage } from '../support/payments/published-message.type';

/**
 * Acceptance tests of the `payments.events` consumers of the order and inventory services against the real
 * infrastructure: the transactional inbox of the order service, the idempotent Lua commit / release of
 * the inventory, and manual offset commits (a group commits past a message only once it is processed).
 * The payment events are published by the test, playing the payment-service.
 */
const STOCK_TOTAL = 10;
const ORDERED_QUANTITY = 2;
/** Budget of one asynchronous step; above the Kafka session timeout (consumer group rebalance). */
const FLOW_TIMEOUT_MS = 45_000;
const TEST_TIMEOUT_MS = 3 * FLOW_TIMEOUT_MS;
const ORDER_GROUP = 'order-payment-consumer-group';
const INVENTORY_GROUP = 'inventory-payment-consumer-group';
const EXPIRATIONS_KEY = 'inventory:reservation_expirations';
const INVENTORY_URL: string =
  process.env['E2E_INVENTORY_URL'] ?? 'http://localhost:3200';

/**
 * One checkout: its SKU (10 in stock), customer and order of 2 units, placed through the order service.
 */
class Checkout {
  public readonly skuId: string = randomUUID();
  public readonly customerId: string = randomUUID();
  public readonly idempotencyKey: string = `e2e-${randomUUID()}`;
  public orderId: string = '';

  /**
   * @param infrastructure - Store connections.
   */
  public constructor(private readonly infrastructure: CheckoutInfrastructure) {}

  /**
   * @returns The reservation key used by the order service.
   */
  public get reservationKey(): string {
    return `${this.customerId}:${this.idempotencyKey}`;
  }

  /**
   * @returns The ordered lines.
   */
  public get items(): { skuId: string; quantity: number }[] {
    return [{ skuId: this.skuId, quantity: ORDERED_QUANTITY }];
  }

  /**
   * Seeds the SKU, then places the order (stock reserved).
   */
  public async executePlace(): Promise<void> {
    await this.infrastructure.inventoryDb.query(
      'INSERT INTO inventory_stocks (sku_id, total_quantity, reserved_quantity, updated_at) VALUES ($1, $2, 0, now())',
      [this.skuId, STOCK_TOTAL],
    );
    await this.infrastructure.redis.hset(`inventory:stock:${this.skuId}`, {
      total: STOCK_TOTAL,
      reserved: 0,
    });
    const response: AxiosResponse<{ orderId: string }> = await axios.post(
      '/api/orders',
      {
        customerId: this.customerId,
        currency: 'USD',
        items: [
          {
            skuId: this.skuId,
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
      { headers: { 'Idempotency-Key': this.idempotencyKey } },
    );
    this.orderId = response.data.orderId;
  }

  /**
   * @returns Status and version of the order row.
   */
  public async findOrder(): Promise<{ status: string; version: number }> {
    const result: { rows: { status: string; version: number }[] } =
      await this.infrastructure.orderDb.query(
        'SELECT status, version FROM orders WHERE id = $1',
        [this.orderId],
      );
    return result.rows[0];
  }

  /**
   * @returns Stock level served by the inventory API.
   */
  public async findStock(): Promise<{
    totalQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }> {
    const response: AxiosResponse<{
      totalQuantity: number;
      reservedQuantity: number;
      availableQuantity: number;
    }> = await axios.get(`${INVENTORY_URL}/api/inventory/stocks/${this.skuId}`);
    const { totalQuantity, reservedQuantity, availableQuantity } =
      response.data;
    return { totalQuantity, reservedQuantity, availableQuantity };
  }

  /**
   * @returns The ledger actions of the order, oldest first.
   */
  public async findLedgerActions(): Promise<string[]> {
    const result: { rows: { action_type: string }[] } =
      await this.infrastructure.inventoryDb.query(
        'SELECT action_type FROM stock_ledger WHERE order_id = $1 ORDER BY created_at',
        [this.orderId],
      );
    return result.rows.map(
      (row: { action_type: string }): string => row.action_type,
    );
  }

  /**
   * @returns How many rows of a table match the order (by column).
   */
  public async countOrderRows(sql: string): Promise<number> {
    const result: { rows: { count: string }[] } =
      await this.infrastructure.orderDb.query(sql, [this.orderId]);
    return Number(result.rows[0].count);
  }

  /**
   * Removes every row and key of the checkout.
   */
  public async executeCleanUp(): Promise<void> {
    const orderId: string = this.orderId || randomUUID();
    await this.infrastructure.orderDb.query(
      "DELETE FROM inbox_events WHERE payload->>'orderId' = $1",
      [orderId],
    );
    await this.infrastructure.orderDb.query(
      'DELETE FROM outbox_events WHERE aggregate_id = $1',
      [orderId],
    );
    await this.infrastructure.orderDb.query(
      'DELETE FROM orders WHERE customer_id = $1',
      [this.customerId],
    );
    await this.infrastructure.inventoryDb.query(
      'DELETE FROM stock_ledger WHERE sku_id = $1',
      [this.skuId],
    );
    await this.infrastructure.inventoryDb.query(
      'DELETE FROM inventory_stocks WHERE sku_id = $1',
      [this.skuId],
    );
    await this.infrastructure.redis.zrem(EXPIRATIONS_KEY, this.reservationKey);
    await this.infrastructure.redis.del(
      `inventory:stock:${this.skuId}`,
      `inventory:reservation:${this.reservationKey}`,
      `inventory:reservation_order:${orderId}`,
      `idempotency:order:${this.customerId}:${this.idempotencyKey}`,
    );
  }
}

describe('payments.events consumers: exactly-once saga steps', () => {
  const infrastructure: CheckoutInfrastructure = new CheckoutInfrastructure();
  const producer: PaymentEventsProducer = new PaymentEventsProducer();
  const checkouts: Checkout[] = [];
  /**
   * Places a new checkout and remembers it for the clean-up.
   */
  const executeNewCheckout = async (): Promise<Checkout> => {
    const checkout: Checkout = new Checkout(infrastructure);
    checkouts.push(checkout);
    await checkout.executePlace();
    return checkout;
  };
  beforeAll(async () => {
    await producer.connect();
  });
  afterAll(async () => {
    await Promise.all(
      checkouts.map((checkout: Checkout): Promise<void> =>
        checkout.executeCleanUp(),
      ),
    );
    await producer.disconnect();
    await infrastructure.executeClose();
  });
  it(
    'Test 1 — the order service applies the same payment.succeeded event once, through its inbox',
    async () => {
      // Given a placed order (PENDING, version 1)
      const checkout: Checkout = await executeNewCheckout();
      expect(await checkout.findOrder()).toEqual({
        status: 'PENDING',
        version: 1,
      });
      // When the same payment.succeeded event (same event id) is delivered three times
      const eventId: string = randomUUID();
      const publishDuplicate = (): Promise<PublishedMessage> =>
        producer.publish({
          eventType: 'payment.succeeded',
          eventId,
          orderId: checkout.orderId,
          items: checkout.items,
        });
      await publishDuplicate();
      await publishDuplicate();
      const last: PublishedMessage = await publishDuplicate();
      await producer.waitForCommit({
        groupId: ORDER_GROUP,
        message: last,
        timeoutMs: FLOW_TIMEOUT_MS,
      });
      // Then the order was confirmed by exactly one update
      expect(await checkout.findOrder()).toEqual({
        status: 'CONFIRMED',
        version: 2,
      });
      // And the inbox holds the event once, with a single order.confirmed in the outbox
      const inboxRows: {
        rows: { id: string; event_type: string; source: string }[];
      } = await infrastructure.orderDb.query(
        "SELECT id, event_type, source FROM inbox_events WHERE payload->>'orderId' = $1",
        [checkout.orderId],
      );
      expect(inboxRows.rows).toEqual([
        {
          id: eventId,
          event_type: 'payment.succeeded',
          source: 'payment-service',
        },
      ]);
      expect(
        await checkout.countOrderRows(
          "SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'order.confirmed'",
        ),
      ).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );
  it(
    'Test 2 — the inventory commits the stock of an order once, even for two payment.succeeded events',
    async () => {
      // Given an order of 2 units reserved from 10
      const checkout: Checkout = await executeNewCheckout();
      expect(await checkout.findStock()).toEqual({
        totalQuantity: 10,
        reservedQuantity: 2,
        availableQuantity: 8,
      });
      // When two payment.succeeded events (different ids, worst case) arrive for that order
      const first: PublishedMessage = await producer.publish({
        eventType: 'payment.succeeded',
        eventId: randomUUID(),
        orderId: checkout.orderId,
        items: checkout.items,
      });
      const second: PublishedMessage = await producer.publish({
        eventType: 'payment.succeeded',
        eventId: randomUUID(),
        orderId: checkout.orderId,
        items: checkout.items,
      });
      await producer.waitForCommit({
        groupId: INVENTORY_GROUP,
        message: second,
        timeoutMs: FLOW_TIMEOUT_MS,
      });
      await producer.waitForCommit({
        groupId: ORDER_GROUP,
        message: second,
        timeoutMs: FLOW_TIMEOUT_MS,
      });
      expect(first.partition).toBe(second.partition);
      // Then the stock left the warehouse once: total 8, nothing reserved, never negative
      expect(await checkout.findStock()).toEqual({
        totalQuantity: 8,
        reservedQuantity: 0,
        availableQuantity: 8,
      });
      const dbStock: {
        rows: { total_quantity: number; reserved_quantity: number }[];
      } = await infrastructure.inventoryDb.query(
        'SELECT total_quantity, reserved_quantity FROM inventory_stocks WHERE sku_id = $1',
        [checkout.skuId],
      );
      expect(dbStock.rows[0]).toEqual({
        total_quantity: 8,
        reserved_quantity: 0,
      });
      // And the ledger has one COMMITTED entry; the order was confirmed once
      expect(await checkout.findLedgerActions()).toEqual([
        'RESERVED',
        'COMMITTED',
      ]);
      expect(await checkout.findOrder()).toEqual({
        status: 'CONFIRMED',
        version: 2,
      });
    },
    TEST_TIMEOUT_MS,
  );
  it(
    'Test 3 — payment.failed cancels the order and gives the reserved stock back at once',
    async () => {
      // Given 2 units of SKU-A reserved: available 10 → 8, reserved 2
      const checkout: Checkout = await executeNewCheckout();
      expect(await checkout.findStock()).toEqual({
        totalQuantity: 10,
        reservedQuantity: 2,
        availableQuantity: 8,
      });
      expect(
        await infrastructure.redis.zscore(
          EXPIRATIONS_KEY,
          checkout.reservationKey,
        ),
      ).not.toBeNull();
      // When payment.failed arrives (twice: a redelivery must change nothing)
      const eventId: string = randomUUID();
      await producer.publish({
        eventType: 'payment.failed',
        eventId,
        orderId: checkout.orderId,
        items: checkout.items,
        reason: 'CARD_DECLINED',
      });
      const redelivery: PublishedMessage = await producer.publish({
        eventType: 'payment.failed',
        eventId,
        orderId: checkout.orderId,
        items: checkout.items,
        reason: 'CARD_DECLINED',
      });
      await producer.waitForCommit({
        groupId: ORDER_GROUP,
        message: redelivery,
        timeoutMs: FLOW_TIMEOUT_MS,
      });
      await producer.waitForCommit({
        groupId: INVENTORY_GROUP,
        message: redelivery,
        timeoutMs: FLOW_TIMEOUT_MS,
      });
      // Then the order is CANCELLED
      expect(await checkout.findOrder()).toEqual({
        status: 'CANCELLED',
        version: 2,
      });
      // And available is back to 10, nothing reserved, the reservation removed from the expiry queue
      expect(await checkout.findStock()).toEqual({
        totalQuantity: 10,
        reservedQuantity: 0,
        availableQuantity: 10,
      });
      expect(
        await infrastructure.redis.zscore(
          EXPIRATIONS_KEY,
          checkout.reservationKey,
        ),
      ).toBeNull();
      expect(
        await infrastructure.redis.exists(
          `inventory:reservation:${checkout.reservationKey}`,
        ),
      ).toBe(0);
      // And the ledger released the units exactly once
      expect(await checkout.findLedgerActions()).toEqual([
        'RESERVED',
        'RELEASED',
      ]);
    },
    TEST_TIMEOUT_MS,
  );
});
