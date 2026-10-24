import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'node:crypto';
import { CheckoutInfrastructure } from '../support/checkout/checkout-infrastructure';

/**
 * Acceptance test of the order read side: an order placed through POST /orders is returned by
 * GET /orders/:id and listed by GET /orders?customerId=.
 */
const STOCK_TOTAL = 10;

describe('Order queries', () => {
  const infrastructure: CheckoutInfrastructure = new CheckoutInfrastructure();
  const skuId: string = randomUUID();
  const customerId: string = randomUUID();
  const idempotencyKey: string = `e2e-query-${randomUUID()}`;
  let orderId: string = '';
  let orderCode: string = '';
  beforeAll(async () => {
    await infrastructure.inventoryDb.query(
      'INSERT INTO inventory_stocks (sku_id, total_quantity, reserved_quantity, updated_at) VALUES ($1, $2, 0, now())',
      [skuId, STOCK_TOTAL],
    );
    await infrastructure.redis.hset(`inventory:stock:${skuId}`, {
      total: STOCK_TOTAL,
      reserved: 0,
    });
    const response: AxiosResponse<{ orderId: string; orderCode: string }> =
      await axios.post(
        '/api/orders',
        {
          customerId,
          currency: 'USD',
          items: [
            { skuId, productName: 'Query mug', quantity: 3, unitPrice: 19.99 },
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
    orderId = response.data.orderId;
    orderCode = response.data.orderCode;
  });
  afterAll(async () => {
    await infrastructure.orderDb.query(
      'DELETE FROM outbox_events WHERE aggregate_id = $1',
      [orderId],
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
      `inventory:reservation:${customerId}:${idempotencyKey}`,
      `inventory:reservation_order:${orderId}`,
      `idempotency:order:${customerId}:${idempotencyKey}`,
    );
    await infrastructure.executeClose();
  });
  it('should return the placed order by id', async () => {
    // Given an order placed for 3 units at 19.99
    // When it is read by id
    const actualResponse: AxiosResponse = await axios.get(
      `/api/orders/${orderId}`,
    );
    // Then every field matches what was placed
    expect(actualResponse.status).toBe(200);
    expect(actualResponse.data).toEqual({
      orderId,
      orderCode,
      customerId,
      status: 'PENDING',
      currency: 'USD',
      subtotalAmount: 59.97,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: 59.97,
      shippingAddress: {
        recipientName: 'E2E',
        phoneNumber: '+84900000000',
        line1: '1 Le Loi',
        city: 'HCMC',
        postalCode: '700000',
        countryCode: 'VN',
      },
      items: [
        {
          skuId,
          productName: 'Query mug',
          quantity: 3,
          unitPrice: 19.99,
          lineTotal: 59.97,
        },
      ],
      version: 1,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });
  it('should list the order on the customer page', async () => {
    // Given the customer has one order
    // When the first page is listed
    const actualResponse: AxiosResponse = await axios.get('/api/orders', {
      params: { customerId, page: 1, limit: 10 },
    });
    // Then it holds that order and the paging metadata
    expect(actualResponse.data).toMatchObject({ page: 1, limit: 10, total: 1 });
    expect(actualResponse.data.items[0].orderId).toBe(orderId);
  });
  it.each([
    {
      scenario: 'an unknown order',
      path: `/api/orders/${randomUUID()}`,
      expectedStatus: 404,
    },
    {
      scenario: 'a malformed id',
      path: '/api/orders/not-a-uuid',
      expectedStatus: 400,
    },
    {
      scenario: 'a list without customerId',
      path: '/api/orders?page=1',
      expectedStatus: 400,
    },
  ])(
    'should answer $expectedStatus for $scenario',
    async ({ path, expectedStatus }) => {
      // Given no matching or valid request
      // When it is sent
      const actualResponse: AxiosResponse = await axios.get(path, {
        validateStatus: (): boolean => true,
      });
      // Then the status explains the problem
      expect(actualResponse.status).toBe(expectedStatus);
    },
  );
});
