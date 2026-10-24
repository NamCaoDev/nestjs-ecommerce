import { OrderItem } from '../entities/order-item.entity';
import { AddressSnapshot } from '../value-objects/address-snapshot.vo';
import { OrderCode } from '../value-objects/order-code.vo';
import { OrderId } from '../value-objects/order-id.vo';
import { OrderStatus } from '../value-objects/order-status.vo';

/**
 * Complete state of an {@link Order}, used by {@link Order.restore} when loading from persistence.
 */
export interface OrderProps {
  readonly id: OrderId;
  readonly orderCode: OrderCode;
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: AddressSnapshot;
  readonly status: OrderStatus;
  /** Optimistic concurrency version. */
  readonly version: number;
  /** Epoch milliseconds. */
  readonly createdAt?: number;
  /** Epoch milliseconds. */
  readonly updatedAt?: number;
}
