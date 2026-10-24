import { AddressSnapshotProps } from '../../../domain/value-objects/address-snapshot.props';

/**
 * Data required to place an order.
 */
export interface CreateOrderCommandProps {
  /** Client Idempotency-Key of the request. */
  readonly idempotencyKey: string;
  /** Logical customer identifier (UUID). */
  readonly customerId: string;
  /** ISO 4217 currency code shared by every unit price. */
  readonly currency: string;
  /** Lines with product data and prices captured upstream at checkout. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly productName: string;
    readonly quantity: number;
    readonly unitPrice: number;
  }>;
  readonly shippingAddress: AddressSnapshotProps;
}
