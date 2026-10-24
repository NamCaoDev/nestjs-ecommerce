import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AbstractPollingWorker } from '@org/shared-infrastructure';
import { RelayOutboxCommand } from '../../application/commands/relay-outbox/relay-outbox.command';

/** Pause between two relay runs when `OUTBOX_RELAY_INTERVAL_MS` is not set: 1 second. */
const DEFAULT_RELAY_INTERVAL_MS = 1_000;

/** Messages relayed per run at most. */
const RELAY_BATCH_SIZE = 50;

/**
 * Background worker polling the transactional outbox through {@link RelayOutboxCommand}.
 * Disabled with `OUTBOX_RELAY_ENABLED=false` (e.g. an API-only deployment).
 */
@Injectable()
export class OutboxRelayService extends AbstractPollingWorker {
  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {
    super({
      enabledFlag: 'OUTBOX_RELAY_ENABLED',
      intervalVariable: 'OUTBOX_RELAY_INTERVAL_MS',
      defaultIntervalMs: DEFAULT_RELAY_INTERVAL_MS,
    });
  }

  /**
   * Relays one batch.
   */
  protected async executeTick(): Promise<void> {
    await this.commandBus.execute(
      new RelayOutboxCommand({ batchSize: RELAY_BATCH_SIZE }),
    );
  }
}
