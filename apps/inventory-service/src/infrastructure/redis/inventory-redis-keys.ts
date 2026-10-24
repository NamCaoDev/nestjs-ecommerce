/** Prefix of the per-SKU stock hashes (fields `total`, `reserved`). */
const STOCK_KEY_PREFIX = 'inventory:stock:';

/** Prefix of the reservation hashes (fields `status`, `orderId`, `items`, `expiresAt`). */
const RESERVATION_KEY_PREFIX = 'inventory:reservation:';

/** Prefix of the order → reservation key index. */
const RESERVATION_ORDER_KEY_PREFIX = 'inventory:reservation_order:';

/** Sorted set of `RESERVED` reservation keys scored by expiry time (epoch ms). */
const RESERVATION_EXPIRATIONS_KEY = 'inventory:reservation_expirations';

/**
 * Redis key layout of the inventory service, shared by the repository and the seed script.
 */
export class InventoryRedisKeys {
  /** Key of the expiry queue (ZSET). */
  public static readonly reservationExpirationsKey: string =
    RESERVATION_EXPIRATIONS_KEY;

  /**
   * @param skuId - Logical SKU identifier.
   * @returns The stock hash key of the SKU.
   */
  public static toStockKey(skuId: string): string {
    return `${STOCK_KEY_PREFIX}${skuId}`;
  }

  /**
   * @param reservationKey - Customer-scoped reservation key.
   * @returns The reservation hash key.
   */
  public static toReservationKey(reservationKey: string): string {
    return `${RESERVATION_KEY_PREFIX}${reservationKey}`;
  }

  /**
   * @param orderId - Logical order identifier.
   * @returns The key indexing the reservation of the order.
   */
  public static toReservationOrderKey(orderId: string): string {
    return `${RESERVATION_ORDER_KEY_PREFIX}${orderId}`;
  }
}
