import { OrderItem } from '../entities/order-item.entity';
import { AddressSnapshot } from '../value-objects/address-snapshot.vo';
import { OrderCode } from '../value-objects/order-code.vo';
import { OrderId } from '../value-objects/order-id.vo';

/**
 * Input of {@link Order.create}.
 */
export interface CreateOrderProps {
  /** Identifier assigned by the application layer. */
  readonly id: OrderId;
  /** Unique customer-facing reference assigned by the application layer. */
  readonly orderCode: OrderCode;
  /** Logical customer identifier (UUID). */
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: AddressSnapshot;
}
