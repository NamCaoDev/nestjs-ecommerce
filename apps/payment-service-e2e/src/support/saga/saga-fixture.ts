import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'node:crypto';
import { SagaInfrastructure } from './saga-infrastructure';
import { SAGA_URLS } from './saga-urls';
import { waitUntil } from './wait-until.util';

/** Units in stock for the SKU of each scenario. */
const STOCK_TOTAL = 10;

/** Units ordered in each scenario. */
const ORDERED_QUANTITY = 2;

/**
 * Budget for one asynchronous hop. Above the Kafka session timeout (~30 s): when a consumer of a
 * previous run was killed, its group only reassigns partitions once that member's session expires.
 */
const FLOW_TIMEOUT_MS = 45_000;

/** Status and reservation counters read back during a scenario. */
interface StockCounters {
  readonly total: string;
  readonly reserved: string;
}

/**
 * One checkout scenario: its own SKU, customer and order, with helpers to drive and observe the saga
 * across the order, inventory and payment services, and to clean up every store afterwards.
 */
export class SagaFixture {
  public readonly stockTotal: number = STOCK_TOTAL;
  public readonly orderedQuantity: number = ORDERED_QUANTITY;
  public readonly skuId: string = randomUUID();
  public readonly customerId: string = randomUUID();
  public readonly idempotencyKey: string = `e2e-${randomUUID()}`;
  public orderId: string = '';

  /**
   * @param infrastructure - Connections to the stores.
   */
  public constructor(private readonly infrastructure: SagaInfrastructure) {}

  /**
   * @returns The reservation key used by the order service: `{customerId}:{Idempotency-Key}`.
   */
  public get reservationKey(): string {
    return `${this.customerId}:${this.idempotencyKey}`;
  }

  /**
   * Seeds the SKU in PostgreSQL and Redis.
   */
  public async saveStock(): Promise<void> {
    await this.infrastructure.inventoryDb.query(
      'INSERT INTO inventory_stocks (sku_id, total_quantity, reserved_quantity, updated_at) VALUES ($1, $2, 0, now())',
      [this.skuId, this.stockTotal],
    );
    await this.infrastructure.redis.hset(`inventory:stock:${this.skuId}`, {
      total: this.stockTotal,
      reserved: 0,
    });
  }

  /**
   * Places the order through the order service.
   *
   * @returns The HTTP response.
   */
  public async executePlaceOrder(): Promise<
    AxiosResponse<{ orderId: string }>
  > {
    const response: AxiosResponse<{ orderId: string }> = await axios.post(
      `${SAGA_URLS.ORDER}/api/orders`,
      {
        customerId: this.customerId,
        currency: 'USD',
        items: [
          {
            skuId: this.skuId,
            productName: 'e2e item',
            quantity: this.orderedQuantity,
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
    return response;
  }

  /**
   * Waits until the payment service has opened the payment of the order.
   *
   * @returns The payment as served by `GET /api/payments/orders/:orderId`.
   */
  public waitForPayment(
    expectedStatus: string,
  ): Promise<Record<string, unknown>> {
    return waitUntil({
      description: `the payment to be ${expectedStatus}`,
      timeoutMs: FLOW_TIMEOUT_MS,
      probe: async (): Promise<Record<string, unknown> | undefined> => {
        const response: AxiosResponse<Record<string, unknown>> =
          await axios.get(`/api/payments/orders/${this.orderId}`, {
            validateStatus: (): boolean => true,
          });
        return response.status === 200 &&
          response.data['status'] === expectedStatus
          ? response.data
          : undefined;
      },
    });
  }

  /**
   * Waits until the order reaches a status.
   */
  public waitForOrderStatus(expectedStatus: string): Promise<string> {
    return waitUntil({
      description: `the order to be ${expectedStatus}`,
      timeoutMs: FLOW_TIMEOUT_MS,
      probe: async (): Promise<string | undefined> => {
        const response: AxiosResponse<{ status: string }> = await axios.get(
          `${SAGA_URLS.ORDER}/api/orders/${this.orderId}`,
        );
        return response.data.status === expectedStatus
          ? response.data.status
          : undefined;
      },
    });
  }

  /**
   * Waits until the ledger holds the given movements of the order, in order.
   */
  public waitForLedger(expectedActions: readonly string[]): Promise<string[]> {
    return waitUntil({
      description: `the ledger to record ${expectedActions.join(', ')}`,
      timeoutMs: FLOW_TIMEOUT_MS,
      probe: async (): Promise<string[] | undefined> => {
        const actions: string[] = await this.findLedgerActions();
        return actions.join() === expectedActions.join() ? actions : undefined;
      },
    });
  }

  /**
   * @returns The ledger actions recorded for the order, oldest first.
   */
  public async findLedgerActions(): Promise<string[]> {
    const result: { rows: { action_type: string }[] } =
      await this.infrastructure.inventoryDb.query(
        'SELECT action_type FROM stock_ledger WHERE sku_id = $1 AND order_id = $2 ORDER BY created_at',
        [this.skuId, this.orderId],
      );
    return result.rows.map(
      (row: { action_type: string }): string => row.action_type,
    );
  }

  /**
   * @returns The status of the reservation hash, or `null` once it is gone.
   */
  public findReservationStatus(): Promise<string | null> {
    return this.infrastructure.redis.hget(
      `inventory:reservation:${this.reservationKey}`,
      'status',
    );
  }

  /**
   * @returns The Redis counters of the SKU.
   */
  public async findRedisStock(): Promise<StockCounters> {
    const counters: Record<string, string> =
      await this.infrastructure.redis.hgetall(`inventory:stock:${this.skuId}`);
    return { total: counters['total'], reserved: counters['reserved'] };
  }

  /**
   * @returns The payment outbox event types of the order.
   */
  public async findPaymentOutboxEvents(): Promise<string[]> {
    const result: { rows: { event_type: string }[] } =
      await this.infrastructure.paymentDb.query(
        "SELECT event_type FROM outbox_events WHERE payload->>'orderId' = $1 ORDER BY occurred_at",
        [this.orderId],
      );
    return result.rows.map(
      (row: { event_type: string }): string => row.event_type,
    );
  }

  /**
   * Removes the rows and keys created by the scenario. Payments stay: their ledger and activity log are
   * append-only (database triggers), and every scenario uses fresh identifiers.
   */
  public async executeCleanUp(): Promise<void> {
    const orderId: string = this.orderId || randomUUID();
    await this.infrastructure.paymentDb.query(
      "DELETE FROM outbox_events WHERE payload->>'orderId' = $1",
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
    await this.infrastructure.redis.zrem(
      'inventory:reservation_expirations',
      this.reservationKey,
    );
    await this.infrastructure.redis.del(
      `inventory:stock:${this.skuId}`,
      `inventory:reservation:${this.reservationKey}`,
      `inventory:reservation_order:${orderId}`,
      `idempotency:order:${this.customerId}:${this.idempotencyKey}`,
    );
  }

  /**
   * @returns The activity actions recorded for the payment of the order, oldest first.
   */
  public async findActivityActions(): Promise<string[]> {
    const result: { rows: { action: string }[] } =
      await this.infrastructure.paymentDb.query(
        'SELECT l.action FROM payment_audit_logs l JOIN payments p ON p.id = l.payment_id WHERE p.order_id = $1 ORDER BY l.created_at, l.id',
        [this.orderId],
      );
    return result.rows.map((row: { action: string }): string => row.action);
  }
}
