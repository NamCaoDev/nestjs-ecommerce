import { Result, ValueObject } from '@org/shared-domain';
import { InvalidRestockError } from '../errors/invalid-restock.error';
import { isUuid } from '../utils/is-uuid.util';
import { RestockRequestProps } from './restock-request.props';

/** Largest quantity accepted in one receipt; guards against unit typos. */
const MAX_RESTOCK_QUANTITY = 1_000_000;

/** Longest accepted reference note; matches `stock_ledger.reference_note VARCHAR(500)`. */
const MAX_REFERENCE_NOTE_LENGTH = 500;

/**
 * Validated receipt of goods for one SKU.
 */
export class RestockRequest extends ValueObject<RestockRequestProps> {
  private constructor(props: RestockRequestProps) {
    super(props);
  }

  /**
   * @param props - SKU, quantity received and optional reference.
   * @returns The request, or an {@link InvalidRestockError} describing the first violated rule.
   */
  public static create(
    props: RestockRequestProps,
  ): Result<RestockRequest, InvalidRestockError> {
    if (!isUuid(props.skuId)) {
      return Result.fail(new InvalidRestockError('skuId must be a UUID'));
    }
    if (
      !Number.isInteger(props.quantity) ||
      props.quantity <= 0 ||
      props.quantity > MAX_RESTOCK_QUANTITY
    ) {
      return Result.fail(
        new InvalidRestockError(
          `quantity must be an integer between 1 and ${MAX_RESTOCK_QUANTITY}`,
        ),
      );
    }
    if ((props.referenceNote ?? '').length > MAX_REFERENCE_NOTE_LENGTH) {
      return Result.fail(
        new InvalidRestockError(
          `referenceNote must be at most ${MAX_REFERENCE_NOTE_LENGTH} characters`,
        ),
      );
    }
    return Result.ok(new RestockRequest({ ...props }));
  }

  /**
   * @returns The SKU identifier.
   */
  public get skuId(): string {
    return this.props.skuId;
  }

  /**
   * @returns Units received.
   */
  public get quantity(): number {
    return this.props.quantity;
  }

  /**
   * @returns The reference note, if any.
   */
  public get referenceNote(): string | undefined {
    return this.props.referenceNote;
  }
}
