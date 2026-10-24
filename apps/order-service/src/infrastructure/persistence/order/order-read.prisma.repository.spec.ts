import { OrderReadModel } from '../../../application/read-models/order.read-model';
import { OrdersPageReadModel } from '../../../application/read-models/orders-page.read-model';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderReadPrismaRepository } from './order-read.prisma.repository';
import { OrderWithItemsRecord } from './order-with-items.record';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';
const STORED_ORDER: OrderWithItemsRecord = {
  id: ORDER_ID,
  orderCode: 'ORD-000000000001',
  customerId: CUSTOMER_ID,
  idempotencyKey: 'checkout-42',
  status: 'PENDING',
  shippingAddress: { city: 'HCMC', countryCode: 'VN' },
  currency: 'USD',
  subtotalAmount: new Prisma.Decimal('39.98'),
  shippingAmount: new Prisma.Decimal(0),
  discountAmount: new Prisma.Decimal(0),
  totalAmount: new Prisma.Decimal('39.98'),
  version: 1,
  createdAt: new Date(Date.UTC(2026, 9, 24, 8)),
  updatedAt: new Date(Date.UTC(2026, 9, 24, 9)),
  items: [
    {
      id: '0199a7c0-0000-7000-8000-0000000000f1',
      orderId: ORDER_ID,
      skuId: '0199a7c0-0000-7000-8000-000000000101',
      productSnapshot: { name: 'Mug' },
      unitPrice: new Prisma.Decimal('19.99'),
      quantity: 2,
      lineTotal: new Prisma.Decimal('39.98'),
    },
  ],
};

describe('OrderReadPrismaRepository', () => {
  let mockClient: {
    readonly $transaction: jest.Mock;
    readonly order: {
      readonly findUnique: jest.Mock;
      readonly findMany: jest.Mock;
      readonly count: jest.Mock;
    };
  };
  let repository: OrderReadPrismaRepository;
  beforeEach(() => {
    mockClient = {
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
      order: {
        findUnique: jest.fn().mockResolvedValue(STORED_ORDER),
        findMany: jest.fn().mockResolvedValue([STORED_ORDER]),
        count: jest.fn().mockResolvedValue(21),
      },
    };
    repository = new OrderReadPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  describe('findById', () => {
    it('should map the row to the read model with plain numbers and epoch timestamps', async () => {
      // Arrange
      const expectedOrder: OrderReadModel = {
        orderId: ORDER_ID,
        orderCode: 'ORD-000000000001',
        customerId: CUSTOMER_ID,
        status: 'PENDING',
        currency: 'USD',
        subtotalAmount: 39.98,
        shippingAmount: 0,
        discountAmount: 0,
        totalAmount: 39.98,
        shippingAddress: { city: 'HCMC', countryCode: 'VN' },
        items: [
          {
            skuId: '0199a7c0-0000-7000-8000-000000000101',
            productName: 'Mug',
            quantity: 2,
            unitPrice: 19.99,
            lineTotal: 39.98,
          },
        ],
        version: 1,
        createdAt: Date.UTC(2026, 9, 24, 8),
        updatedAt: Date.UTC(2026, 9, 24, 9),
      };
      // Act
      const actualOrder: OrderReadModel | undefined =
        await repository.findById(ORDER_ID);
      // Assert
      expect(actualOrder).toEqual(expectedOrder);
      expect(actualOrder).not.toHaveProperty('idempotencyKey');
    });
    it('should return undefined for an unknown order', async () => {
      // Arrange
      mockClient.order.findUnique.mockResolvedValue(null);
      // Act
      const actualOrder: OrderReadModel | undefined =
        await repository.findById(ORDER_ID);
      // Assert
      expect(actualOrder).toBeUndefined();
    });
  });
  describe('findByCustomer', () => {
    it('should read one page newest first with the total count', async () => {
      // Arrange
      const inputPage: number = 3;
      // Act
      const actualPage: OrdersPageReadModel = await repository.findByCustomer({
        customerId: CUSTOMER_ID,
        page: inputPage,
        limit: 10,
      });
      // Assert
      expect(mockClient.order.findMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID },
        include: { items: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 10,
      });
      expect(actualPage).toMatchObject({ page: 3, limit: 10, total: 21 });
      expect(actualPage.items[0].orderId).toBe(ORDER_ID);
    });
  });
});
