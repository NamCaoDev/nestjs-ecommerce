import { Money } from '../value-objects/money.vo';

/**
 * Attributes required to create an {@link OrderItem}.
 */
export interface OrderItemProps {
  /** Logical SKU identifier (UUID) owned by the inventory service. */
  readonly skuId: string;
  /** Product name captured at purchase time. */
  readonly productName: string;
  /** Number of units; a positive integer. */
  readonly quantity: number;
  /** Unit price captured at purchase time. */
  readonly unitPrice: Money;
}
