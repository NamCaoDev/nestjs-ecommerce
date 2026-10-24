import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { EventPublisherPort } from '../../ports/event-publisher.port';
import { EVENT_PUBLISHER_PORT } from '../../ports/event-publisher.token';
import type { OutboxEventRepositoryPort } from '../../ports/outbox-event-repository.port';
import { OUTBOX_EVENT_REPOSITORY_PORT } from '../../ports/outbox-event-repository.token';
import { OutboxMessage } from '../../ports/outbox-message.type';
import { RelayOutboxCommand } from './relay-outbox.command';
import { RelayOutboxOutput } from './relay-outbox.output';

/** Failed attempts after which a stuck batch is reported as an error instead of a warning. */
const RETRY_ALERT_THRESHOLD = 5;

/**
 * Publishes pending outbox messages to the broker, then marks them `PUBLISHED` (CLAUDE.md §4.2).
 * Delivery is at-least-once: a crash between publishing and marking republishes the batch, which
 * consumers absorb by deduplicating on the event id. A failed batch stays `PENDING` and is retried
 * on the next run, in order, so no event is lost or overtaken. Claims make it safe to run several
 * relay instances.
 */
@CommandHandler(RelayOutboxCommand)
export class RelayOutboxHandler implements ICommandHandler<
  RelayOutboxCommand,
  RelayOutboxOutput
> {
  private readonly logger: Logger = new Logger(RelayOutboxHandler.name);

  /**
   * @param outboxRepository - Transactional outbox.
   * @param eventPublisher - Message broker.
   */
  public constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY_PORT)
    private readonly outboxRepository: OutboxEventRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  /**
   * @param command - Batch size of the run.
   * @returns How many messages were published or failed.
   */
  public async execute(
    command: RelayOutboxCommand,
  ): Promise<RelayOutboxOutput> {
    const messages: OutboxMessage[] =
      await this.outboxRepository.claimPendingBatch(command.batchSize);
    if (messages.length === 0) {
      return { publishedCount: 0, failedCount: 0 };
    }
    const ids: string[] = messages.map(
      (message: OutboxMessage): string => message.id,
    );
    try {
      await this.eventPublisher.publish(messages);
    } catch (err: unknown) {
      await this.saveFailedAttempt({ messages, err });
      return { publishedCount: 0, failedCount: messages.length };
    }
    await this.outboxRepository.markPublished({ ids, publishedAt: Date.now() });
    return { publishedCount: messages.length, failedCount: 0 };
  }

  /**
   * Records the failed attempt and logs it, as an error once the batch has failed repeatedly.
   */
  private async saveFailedAttempt({
    messages,
    err,
  }: {
    readonly messages: readonly OutboxMessage[];
    readonly err: unknown;
  }): Promise<void> {
    const reason: string = err instanceof Error ? err.message : String(err);
    await this.outboxRepository.markFailed({
      ids: messages.map((message: OutboxMessage): string => message.id),
      error: reason,
    });
    const attempts: number = Math.max(
      ...messages.map(
        (message: OutboxMessage): number => message.retryCount + 1,
      ),
    );
    const logMessage: string = `Outbox relay failed for ${messages.length} message(s) after ${attempts} attempt(s): ${reason}`;
    if (attempts >= RETRY_ALERT_THRESHOLD) {
      this.logger.error(logMessage);
      return;
    }
    this.logger.warn(logMessage);
  }
}
