import { Injectable } from '@nestjs/common';
import { FindOrdersByCustomerInput } from '../../../application/ports/find-orders-by-customer.input';
import { OrderReadPort } from '../../../application/ports/order-read.port';
import { OrderReadModel } from '../../../application/read-models/order.read-model';
import { OrdersPageReadModel } from '../../../application/read-models/orders-page.read-model';
import { PrismaService } from '../prisma/prisma.service';
import { OrderWithItemsRecord } from './order-with-items.record';
import { ProductSnapshotJson } from './product-snapshot.json';

/**
 * Prisma implementation of {@link OrderReadPort}: maps rows to read models directly,
 * without rebuilding the aggregate.
 */
@Injectable()
export class OrderReadPrismaRepository implements OrderReadPort {
  /**
   * @param prisma - Client for `order_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param orderId - Order UUID.
   * @returns The order, or `undefined` when it does not exist.
   */
  public async findById(orderId: string): Promise<OrderReadModel | undefined> {
    const record: OrderWithItemsRecord | null =
      await this.prisma.client.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
    return record === null
      ? undefined
      : OrderReadPrismaRepository.toReadModel(record);
  }

  /**
   * Reads one page and the total count in a single transaction, so both reflect the same snapshot.
   *
   * @param input - Customer and page.
   * @returns The requested page, newest orders first.
   */
  public async findByCustomer({
    customerId,
    page,
    limit,
  }: FindOrdersByCustomerInput): Promise<OrdersPageReadModel> {
    const [records, total]: [OrderWithItemsRecord[], number] =
      await this.prisma.client.$transaction([
        this.prisma.client.order.findMany({
          where: { customerId },
          include: { items: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.client.order.count({ where: { customerId } }),
      ]);
    return {
      items: records.map(OrderReadPrismaRepository.toReadModel),
      page,
      limit,
      total,
    };
  }

  /**
   * @returns The read model of an order row.
   */
  private static toReadModel(record: OrderWithItemsRecord): OrderReadModel {
    return {
      orderId: record.id,
      orderCode: record.orderCode,
      customerId: record.customerId,
      status: record.status,
      currency: record.currency,
      subtotalAmount: record.subtotalAmount.toNumber(),
      shippingAmount: record.shippingAmount.toNumber(),
      discountAmount: record.discountAmount.toNumber(),
      totalAmount: record.totalAmount.toNumber(),
      shippingAddress: record.shippingAddress as Record<string, unknown>,
      items: record.items.map(
        (
          item: OrderWithItemsRecord['items'][number],
        ): OrderReadModel['items'][number] => ({
          skuId: item.skuId,
          productName: (item.productSnapshot as unknown as ProductSnapshotJson)
            .name,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
          lineTotal: item.lineTotal.toNumber(),
        }),
      ),
      version: record.version,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.updatedAt.getTime(),
    };
  }
}
