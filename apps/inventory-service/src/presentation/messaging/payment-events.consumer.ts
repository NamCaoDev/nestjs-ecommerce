import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  IntegrationEventEnvelope,
  PAYMENT_EVENT_TYPES,
  PAYMENTS_EVENTS_PARTITIONS,
  PAYMENTS_EVENTS_TOPIC,
} from '@org/contracts';
import {
  KAFKA_CLIENT,
  KafkaConsumerService,
  KafkaTopicManager,
} from '@org/shared-messaging';
import { DomainError, Result } from '@org/shared-domain';
import type { Kafka } from 'kafkajs';
import { CommitStockCommand } from '../../application/commands/commit-stock/commit-stock.command';
import { ReleaseOrderStockCommand } from '../../application/commands/release-order-stock/release-order-stock.command';
import { ReservationLine } from '../../domain/value-objects/reservation-line.type';

/** Consumer group shared by every inventory-service instance on `payments.events`. */
const CONSUMER_GROUP_ID = 'inventory-payment-consumer-group';

/**
 * Inbound adapter for `payments.events` (saga choreography): `payment.succeeded` ships the order's
 * stock ({@link CommitStockCommand}, `atomic_commit.lua`); `payment.failed` returns it at once
 * ({@link ReleaseOrderStockCommand}, `atomic_release.lua`). Business refusals are logged and skipped;
 * unexpected errors propagate so Kafka redelivers the message.
 */
@Injectable()
export class PaymentEventsConsumer extends KafkaConsumerService {
  /**
   * @param kafka - Shared Kafka client.
   * @param topicManager - Topic provisioning.
   * @param commandBus - CQRS command bus.
   */
  public constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    topicManager: KafkaTopicManager,
    private readonly commandBus: CommandBus,
  ) {
    super({
      kafka,
      topicManager,
      subscription: {
        topic: PAYMENTS_EVENTS_TOPIC,
        numPartitions: PAYMENTS_EVENTS_PARTITIONS,
        groupId: CONSUMER_GROUP_ID,
      },
    });
  }

  /**
   * @param envelope - Decoded `payments.events` message.
   */
  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    const command: CommitStockCommand | ReleaseOrderStockCommand | undefined =
      PaymentEventsConsumer.toCommand(envelope);
    if (command === undefined) {
      return;
    }
    const result: Result<void, DomainError> =
      await this.commandBus.execute(command);
    if (result.isFailure) {
      this.logger.warn(
        `Skipping event ${envelope.eventId}: ${result.getError().message}`,
      );
    }
  }

  /**
   * @returns The stock command for a payment outcome, or `undefined` for other events.
   */
  private static toCommand({
    eventType,
    payload,
  }: IntegrationEventEnvelope<Record<string, unknown>>):
    CommitStockCommand | ReleaseOrderStockCommand | undefined {
    const orderId: string = String(payload['orderId']);
    if (eventType === PAYMENT_EVENT_TYPES.SUCCEEDED) {
      return new CommitStockCommand({
        orderId,
        items: PaymentEventsConsumer.toReservationLines(payload['items']),
      });
    }
    if (eventType === PAYMENT_EVENT_TYPES.FAILED) {
      return new ReleaseOrderStockCommand({ orderId });
    }
    return undefined;
  }

  /**
   * Extracts `{ skuId, quantity }` lines from a payment payload; anything malformed is passed through
   * as is and rejected by the domain validation of the command.
   */
  private static toReservationLines(items: unknown): ReservationLine[] {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map(
      (item: {
        readonly skuId?: unknown;
        readonly quantity?: unknown;
      }): ReservationLine => ({
        skuId: String(item?.skuId),
        quantity: Number(item?.quantity),
      }),
    );
  }
}
