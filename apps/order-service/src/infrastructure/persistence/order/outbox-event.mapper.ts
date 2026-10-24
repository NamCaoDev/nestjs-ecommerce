import {
  OrderCancelledPayload,
  OrderConfirmedPayload,
  OrderPlacedPayload,
} from '@org/contracts';
import { DomainEvent } from '@org/shared-domain';
import { OrderCancelledEvent } from '../../../domain/events/order-cancelled.event';
import { OrderConfirmedEvent } from '../../../domain/events/order-confirmed.event';
import { OrderPlacedEvent } from '../../../domain/events/order-placed.event';
import { Prisma } from '../prisma/generated/client';

/** Aggregate type stored on every order outbox message. */
const ORDER_AGGREGATE_TYPE = 'Order';

/**
 * Maps order domain events to `outbox_events` rows whose payloads follow `@org/contracts`.
 */
export class OutboxEventMapper {
  /**
   * @param event - Domain event raised by the Order aggregate.
   * @returns The outbox row; its id is the event id so consumers can deduplicate.
   */
  public static toCreateInput(
    event: DomainEvent,
  ): Prisma.OutboxEventCreateManyInput {
    return {
      id: event.eventId,
      aggregateType: ORDER_AGGREGATE_TYPE,
      aggregateId: event.aggregateId,
      eventType: event.eventName,
      payload: OutboxEventMapper.toPayload(event),
      occurredAt: new Date(event.occurredAt),
    };
  }

  /**
   * Builds the integration payload of a domain event.
   *
   * @throws {Error} When the event type has no integration contract (programming error).
   */
  private static toPayload(event: DomainEvent): Prisma.InputJsonObject {
    if (event instanceof OrderPlacedEvent) {
      return OutboxEventMapper.toJson(OutboxEventMapper.toPlacedPayload(event));
    }
    if (event instanceof OrderConfirmedEvent) {
      const payload: OrderConfirmedPayload = {
        orderId: event.aggregateId,
        confirmedAt: event.occurredAt,
      };
      return OutboxEventMapper.toJson(payload);
    }
    if (event instanceof OrderCancelledEvent) {
      const payload: OrderCancelledPayload = {
        orderId: event.aggregateId,
        reason: event.reason,
        items: event.items,
      };
      return OutboxEventMapper.toJson(payload);
    }
    throw new Error(`No outbox contract for domain event ${event.eventName}.`);
  }

  /**
   * @returns The `order.placed` integration payload.
   */
  private static toPlacedPayload(event: OrderPlacedEvent): OrderPlacedPayload {
    return {
      orderId: event.aggregateId,
      customerId: event.customerId,
      finalAmount: event.totalAmount,
      items: event.items,
      createdAt: event.occurredAt,
    };
  }

  /**
   * Narrows a contract payload (plain JSON data) to Prisma's JSON input type.
   */
  private static toJson(payload: object): Prisma.InputJsonObject {
    return payload as Prisma.InputJsonObject;
  }
}
