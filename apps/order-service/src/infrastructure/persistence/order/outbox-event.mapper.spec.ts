import { DomainEvent } from '@org/shared-domain';
import { OrderCancelledEvent } from '../../../domain/events/order-cancelled.event';
import { OrderConfirmedEvent } from '../../../domain/events/order-confirmed.event';
import { OrderPlacedEvent } from '../../../domain/events/order-placed.event';
import { Prisma } from '../prisma/generated/client';
import { OutboxEventMapper } from './outbox-event.mapper';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const OCCURRED_AT = Date.UTC(2026, 9, 24, 8);
const ITEM = { skuId: '0199a7c0-0000-7000-8000-0000000000a1', quantity: 2 };

describe('OutboxEventMapper', () => {
  describe('toCreateInput', () => {
    it('should map OrderPlacedEvent to the order.placed contract', () => {
      // Arrange
      const inputEvent: OrderPlacedEvent = new OrderPlacedEvent({
        orderId: ORDER_ID,
        customerId: '0199a7c0-0000-7000-8000-0000000000c1',
        totalAmount: 39.98,
        currency: 'USD',
        items: [{ ...ITEM, unitPrice: 19.99 }],
        occurredAt: OCCURRED_AT,
      });
      // Act
      const actualRow: Prisma.OutboxEventCreateManyInput =
        OutboxEventMapper.toCreateInput(inputEvent);
      // Assert
      expect(actualRow).toEqual({
        id: inputEvent.eventId,
        aggregateType: 'Order',
        aggregateId: ORDER_ID,
        eventType: 'order.placed',
        occurredAt: new Date(OCCURRED_AT),
        payload: {
          orderId: ORDER_ID,
          customerId: '0199a7c0-0000-7000-8000-0000000000c1',
          finalAmount: 39.98,
          currency: 'USD',
          items: [{ ...ITEM, unitPrice: 19.99 }],
          createdAt: OCCURRED_AT,
        },
      });
    });
    it('should map OrderConfirmedEvent to the order.confirmed contract', () => {
      // Arrange
      const inputEvent: OrderConfirmedEvent = new OrderConfirmedEvent({
        orderId: ORDER_ID,
        occurredAt: OCCURRED_AT,
      });
      // Act
      const actualRow: Prisma.OutboxEventCreateManyInput =
        OutboxEventMapper.toCreateInput(inputEvent);
      // Assert
      expect(actualRow.payload).toEqual({
        orderId: ORDER_ID,
        confirmedAt: OCCURRED_AT,
      });
    });
    it('should map OrderCancelledEvent to the order.cancelled contract', () => {
      // Arrange
      const inputEvent: OrderCancelledEvent = new OrderCancelledEvent({
        orderId: ORDER_ID,
        reason: 'Customer request',
        items: [ITEM],
        occurredAt: OCCURRED_AT,
      });
      // Act
      const actualRow: Prisma.OutboxEventCreateManyInput =
        OutboxEventMapper.toCreateInput(inputEvent);
      // Assert
      expect(actualRow.eventType).toBe('order.cancelled');
      expect(actualRow.payload).toEqual({
        orderId: ORDER_ID,
        reason: 'Customer request',
        items: [ITEM],
      });
    });
    it('should throw for an event without an integration contract', () => {
      // Arrange
      const inputEvent: DomainEvent = {
        eventId: '0199a7c0-0000-7000-8000-0000000000e1',
        eventName: 'order.unknown',
        aggregateId: ORDER_ID,
        occurredAt: OCCURRED_AT,
      };
      // Act
      const actualMapping = (): Prisma.OutboxEventCreateManyInput =>
        OutboxEventMapper.toCreateInput(inputEvent);
      // Assert
      expect(actualMapping).toThrow('order.unknown');
    });
  });
});
