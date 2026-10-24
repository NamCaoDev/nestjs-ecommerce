import { DomainEvent } from './domain-event.interface';
import { Entity } from './entity.base';

/**
 * Base class for Aggregate Roots: the consistency boundary of a cluster of entities.
 *
 * Domain methods record events with {@link AggregateRoot.addDomainEvent}. The persistence adapter
 * reads {@link AggregateRoot.domainEvents}, stores them in the outbox within the same transaction,
 * and then calls {@link AggregateRoot.clearEvents}.
 *
 * @typeParam TId - Type of the aggregate identifier.
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  #domainEvents: DomainEvent[] = [];

  /**
   * @returns A read-only snapshot of the events raised since the last {@link AggregateRoot.clearEvents}.
   */
  public get domainEvents(): readonly DomainEvent[] {
    return [...this.#domainEvents];
  }

  /**
   * Removes every pending domain event, typically after they have been written to the outbox.
   */
  public clearEvents(): void {
    this.#domainEvents = [];
  }

  /**
   * Records a domain event raised by a state change of this aggregate.
   *
   * @param event - Event to append to the pending list.
   */
  protected addDomainEvent(event: DomainEvent): void {
    this.#domainEvents = [...this.#domainEvents, Object.freeze(event)];
  }
}
