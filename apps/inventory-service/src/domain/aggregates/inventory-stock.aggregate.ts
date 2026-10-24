import { AggregateRoot, Result } from '@org/shared-domain';
import { InvalidStockError } from '../errors/invalid-stock.error';
import { isUuid } from '../utils/is-uuid.util';
import { InventoryStockProps } from './inventory-stock.props';

/** Version of a newly stocked SKU. */
const INITIAL_VERSION = 1;

/**
 * Stock level of one SKU. Invariant: `0 <= reservedQuantity <= totalQuantity`.
 *
 * On the checkout hot path the counters live in Redis and change through Lua scripts
 * (CLAUDE.md §4.1); this aggregate validates stock levels when they are created or loaded.
 */
export class InventoryStock extends AggregateRoot<string> {
  /** Units physically held. */
  public readonly totalQuantity: number;
  /** Units held for pending orders. */
  public readonly reservedQuantity: number;
  /** Optimistic concurrency version. */
  public readonly version: number;

  private constructor(props: InventoryStockProps) {
    super({ id: props.skuId });
    this.totalQuantity = props.totalQuantity;
    this.reservedQuantity = props.reservedQuantity;
    this.version = props.version;
  }

  /**
   * Stocks a SKU with nothing reserved.
   *
   * @param props - SKU and total quantity.
   * @returns The stock level, or an {@link InvalidStockError} when the input is invalid.
   */
  public static create({
    skuId,
    totalQuantity,
  }: {
    readonly skuId: string;
    readonly totalQuantity: number;
  }): Result<InventoryStock, InvalidStockError> {
    if (!isUuid(skuId)) {
      return Result.fail(new InvalidStockError('skuId must be a UUID'));
    }
    if (!Number.isInteger(totalQuantity) || totalQuantity < 0) {
      return Result.fail(
        new InvalidStockError('totalQuantity must be a non-negative integer'),
      );
    }
    return Result.ok(
      new InventoryStock({
        skuId,
        totalQuantity,
        reservedQuantity: 0,
        version: INITIAL_VERSION,
      }),
    );
  }

  /**
   * @returns The logical SKU identifier.
   */
  public get skuId(): string {
    return this.id;
  }

  /**
   * @returns Units that can still be reserved.
   */
  public get availableQuantity(): number {
    return this.totalQuantity - this.reservedQuantity;
  }
}
