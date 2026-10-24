import { EntityProps } from './entity-props.interface';
import { isDeepEqual } from './utils/is-deep-equal.util';

/**
 * Base class for Entities: domain objects defined by a stable identity rather than by their attributes.
 *
 * Timestamps follow the domain-wide convention of epoch milliseconds (`number`), so they are
 * immutable primitives. Subclasses call {@link Entity.touch} from their domain methods whenever
 * state changes. A getter that exposes a `Date` must build a new instance on every call.
 *
 * @typeParam TId - Type of the entity identifier (a primitive or an identifier Value Object).
 */
export abstract class Entity<TId> {
  /** Unique identifier of the entity. */
  public readonly id: TId;
  /** Creation time in epoch milliseconds. */
  public readonly createdAt: number;
  #updatedAt: number;

  /**
   * @param props - Identity and optional audit timestamps.
   */
  protected constructor({
    id,
    createdAt = Date.now(),
    updatedAt = createdAt,
  }: EntityProps<TId>) {
    this.id = id;
    this.createdAt = createdAt;
    this.#updatedAt = updatedAt;
  }

  /**
   * @returns Last modification time in epoch milliseconds.
   */
  public get updatedAt(): number {
    return this.#updatedAt;
  }

  /**
   * Compares two entities by identity.
   *
   * @param other - Entity to compare with.
   * @returns `true` when `other` is of the same concrete type and has an equal identifier.
   */
  public equals(other?: Entity<TId>): boolean {
    if (other === undefined || other === null) {
      return false;
    }
    if (this === other) {
      return true;
    }
    return (
      this.constructor === other.constructor && isDeepEqual(this.id, other.id)
    );
  }

  /**
   * Records a state change by moving the modification time forward.
   *
   * @param occurredAt - Moment of the change in epoch milliseconds; defaults to now.
   */
  protected touch(occurredAt: number = Date.now()): void {
    this.#updatedAt = occurredAt;
  }
}
