import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderItem } from '../../../domain/entities/order-item.entity';
import { AddressSnapshotProps } from '../../../domain/value-objects/address-snapshot.props';
import { AddressSnapshot } from '../../../domain/value-objects/address-snapshot.vo';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderCode } from '../../../domain/value-objects/order-code.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { Prisma } from '../prisma/generated/client';
import { OrderWithItemsRecord } from './order-with-items.record';
import { ProductSnapshotJson } from './product-snapshot.json';
import { ToCreateOrderInputInput } from './to-create-order-input.input';

/** Shipping is not modelled in the domain yet; stored as zero until it is. */
const SHIPPING_AMOUNT_PLACEHOLDER = 0;

/** Discounts are not modelled in the domain yet; stored as zero until they are. */
const DISCOUNT_AMOUNT_PLACEHOLDER = 0;

/**
 * Translates between the {@link Order} aggregate and the `orders` / `order_items` tables.
 * Stored data is trusted: an invalid row is a corruption and throws.
 */
export class OrderPersistenceMapper {
  /**
   * @param input - Order to insert and the request Idempotency-Key.
   * @returns The Prisma create input, with order lines created in the same statement.
   */
  public static toCreateInput({
    order,
    idempotencyKey,
  }: ToCreateOrderInputInput): Prisma.OrderCreateInput {
    const totalAmount: Money = order.totalAmount;
    return {
      id: order.id.value,
      orderCode: order.orderCode.value,
      customerId: order.customerId,
      idempotencyKey,
      status: order.status.value,
      shippingAddress: OrderPersistenceMapper.toAddressJson(order),
      currency: totalAmount.currency,
      subtotalAmount: totalAmount.amount,
      shippingAmount: SHIPPING_AMOUNT_PLACEHOLDER,
      discountAmount: DISCOUNT_AMOUNT_PLACEHOLDER,
      totalAmount: totalAmount.amount,
      version: order.version,
      createdAt: new Date(order.createdAt),
      items: { create: order.items.map(OrderPersistenceMapper.toItemInput) },
    };
  }

  /**
   * @param record - Order row with its lines.
   * @returns The rehydrated aggregate, without domain events.
   */
  public static toDomain(record: OrderWithItemsRecord): Order {
    return Order.restore({
      id: OrderId.create(record.id).getValue(),
      orderCode: OrderCode.create(record.orderCode).getValue(),
      customerId: record.customerId,
      items: record.items.map(
        (item: OrderWithItemsRecord['items'][number]): OrderItem =>
          OrderPersistenceMapper.toDomainItem({ item, record }),
      ),
      shippingAddress: AddressSnapshot.create(
        record.shippingAddress as unknown as AddressSnapshotProps,
      ).getValue(),
      status: OrderStatus.create(record.status).getValue(),
      version: record.version,
      createdAt: record.createdAt.getTime(),
      updatedAt: record.updatedAt.getTime(),
    });
  }

  /**
   * @returns The `order_items` create input of one line.
   */
  private static toItemInput(
    item: OrderItem,
  ): Prisma.OrderItemCreateWithoutOrderInput {
    const productSnapshot: ProductSnapshotJson = { name: item.productName };
    return {
      skuId: item.skuId,
      productSnapshot: { ...productSnapshot },
      unitPrice: item.unitPrice.amount,
      quantity: item.quantity,
      lineTotal: item.lineTotal.amount,
    };
  }

  /**
   * @returns The domain line rebuilt from its row, priced in the order currency.
   */
  private static toDomainItem({
    item,
    record,
  }: {
    readonly item: OrderWithItemsRecord['items'][number];
    readonly record: OrderWithItemsRecord;
  }): OrderItem {
    const productSnapshot: ProductSnapshotJson =
      item.productSnapshot as unknown as ProductSnapshotJson;
    return OrderItem.create({
      skuId: item.skuId,
      productName: productSnapshot.name,
      quantity: item.quantity,
      unitPrice: Money.create({
        amount: item.unitPrice.toNumber(),
        currency: record.currency,
      }).getValue(),
    }).getValue();
  }

  /**
   * @returns The address snapshot as a JSON object, omitting absent optional fields.
   */
  private static toAddressJson(order: Order): Prisma.InputJsonObject {
    return JSON.parse(
      JSON.stringify(order.shippingAddress.toPrimitives()),
    ) as Prisma.InputJsonObject;
  }
}
