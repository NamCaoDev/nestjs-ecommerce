import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { StockLevelReadModel } from '../../read-models/stock-level.read-model';

/**
 * Command recording goods received for one SKU. Handled by {@link RestockSkuHandler}.
 */
export class RestockSkuCommand extends Command<
  Result<StockLevelReadModel, DomainError>
> {
  public readonly skuId: string;
  /** Units received. */
  public readonly additionalQuantity: number;
  /** Optional reference, e.g. a purchase order number. */
  public readonly referenceNote?: string;
  /** Idempotency-Key of the request. */
  public readonly idempotencyKey: string;

  /**
   * @param props - SKU, units received, optional reference and Idempotency-Key.
   */
  public constructor(props: {
    readonly skuId: string;
    readonly additionalQuantity: number;
    readonly referenceNote?: string;
    readonly idempotencyKey: string;
  }) {
    super();
    this.skuId = props.skuId;
    this.additionalQuantity = props.additionalQuantity;
    this.referenceNote = props.referenceNote;
    this.idempotencyKey = props.idempotencyKey;
  }
}
