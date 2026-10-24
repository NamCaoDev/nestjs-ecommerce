import { deepFreeze } from './utils/deep-freeze.util';
import { isDeepEqual } from './utils/is-deep-equal.util';

/**
 * Base class for Value Objects: immutable domain values identified by their attributes, not by identity.
 *
 * Properties are deeply frozen on construction, so any later mutation attempt throws a `TypeError`
 * in strict mode. Subclasses validate their invariants in a static factory before calling `super`.
 * The instance itself is frozen too, so subclasses must not declare instance fields:
 * expose attributes through getters that read from `props`.
 *
 * @typeParam T - Shape of the wrapped value (a primitive or a plain object).
 *
 * @example
 * class Money extends ValueObject<{ amount: number; currency: string }> {
 *   public static create(amount: number, currency: string): Money {
 *     return new Money({ amount, currency });
 *   }
 *
 *   public get amount(): number {
 *     return this.props.amount;
 *   }
 * }
 */
export abstract class ValueObject<T> {
  /** Deeply frozen attributes of this Value Object. */
  protected readonly props: Readonly<T>;

  /**
   * @param props - Attributes of the Value Object; they are frozen in place.
   */
  protected constructor(props: T) {
    this.props = deepFreeze(props);
    Object.freeze(this);
  }

  /**
   * Compares two Value Objects structurally.
   *
   * @param other - Value Object to compare with.
   * @returns `true` when `other` is of the same concrete type and holds equal attributes.
   */
  public equals(other?: ValueObject<T>): boolean {
    if (other === undefined || other === null) {
      return false;
    }
    if (this === other) {
      return true;
    }
    return (
      this.constructor === other.constructor &&
      isDeepEqual(this.props, other.props)
    );
  }

  /**
   * Checks that this instance and its attributes are frozen.
   *
   * @returns `true` when neither the instance nor its attributes can be mutated.
   */
  public isImmutable(): boolean {
    return Object.isFrozen(this) && Object.isFrozen(this.props);
  }
}
