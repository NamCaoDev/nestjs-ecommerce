import { AggregateRoot } from './aggregate-root.base';
import { DomainEvent } from './domain-event.interface';

const ORDER_PLACED_EVENT_NAME = 'order.placed';

class Order extends AggregateRoot<string> {
  public static create(id: string): Order {
    return new Order({ id });
  }

  public executePlace(event: DomainEvent): void {
    this.addDomainEvent(event);
  }
}

/**
 * Builds a domain event fixture for the given aggregate.
 */
function createMockEvent(aggregateId: string): DomainEvent {
  return {
    eventId: 'evt-1',
    eventName: ORDER_PLACED_EVENT_NAME,
    aggregateId,
    occurredAt: Date.UTC(2026, 0, 1),
  };
}

describe('AggregateRoot', () => {
  describe('addDomainEvent', () => {
    it('should record the raised event', () => {
      // Arrange
      const inputOrder: Order = Order.create('o-1');
      const expectedEvent: DomainEvent = createMockEvent('o-1');
      // Act
      inputOrder.executePlace(expectedEvent);
      // Assert
      expect(inputOrder.domainEvents).toEqual([expectedEvent]);
    });
    it('should freeze the recorded event', () => {
      // Arrange
      const inputOrder: Order = Order.create('o-1');
      // Act
      inputOrder.executePlace(createMockEvent('o-1'));
      // Assert
      expect(Object.isFrozen(inputOrder.domainEvents[0])).toBe(true);
    });
  });
  describe('domainEvents', () => {
    it('should return a snapshot that does not expose the internal list', () => {
      // Arrange
      const inputOrder: Order = Order.create('o-1');
      inputOrder.executePlace(createMockEvent('o-1'));
      const actualSnapshot: DomainEvent[] =
        inputOrder.domainEvents as DomainEvent[];
      // Act
      actualSnapshot.push(createMockEvent('o-2'));
      // Assert
      expect(inputOrder.domainEvents).toHaveLength(1);
    });
  });
  describe('clearEvents', () => {
    it('should remove every pending event', () => {
      // Arrange
      const inputOrder: Order = Order.create('o-1');
      inputOrder.executePlace(createMockEvent('o-1'));
      // Act
      inputOrder.clearEvents();
      // Assert
      expect(inputOrder.domainEvents).toEqual([]);
    });
  });
});
