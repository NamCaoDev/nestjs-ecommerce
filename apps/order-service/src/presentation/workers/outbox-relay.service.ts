import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RelayOutboxCommand } from '../../application/commands/relay-outbox/relay-outbox.command';
import { readEnv } from '@org/shared-infrastructure';

/** Default pause between two relay runs: 1 second. */
const DEFAULT_RELAY_INTERVAL_MS = '1000';

/** Messages relayed per run at most. */
const RELAY_BATCH_SIZE = 50;

/**
 * Background worker polling the transactional outbox every `OUTBOX_RELAY_INTERVAL_MS`
 * (default 1 s) through {@link RelayOutboxCommand}. Runs never overlap.
 */
@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger: Logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | undefined;
  private isRelaying: boolean = false;

  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {}

  /**
   * Starts polling the outbox.
   */
  public onApplicationBootstrap(): void {
    const intervalMs: number = Number(
      readEnv({
        name: 'OUTBOX_RELAY_INTERVAL_MS',
        defaultValue: DEFAULT_RELAY_INTERVAL_MS,
      }),
    );
    this.timer = setInterval((): void => {
      void this.executeRelay();
    }, intervalMs);
  }

  /**
   * Stops polling the outbox.
   */
  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Relays one batch unless the previous run is still in progress. Unexpected failures
   * (e.g. database down) are logged and retried on the next tick.
   */
  public async executeRelay(): Promise<void> {
    if (this.isRelaying) {
      return;
    }
    this.isRelaying = true;
    try {
      await this.commandBus.execute(
        new RelayOutboxCommand({ batchSize: RELAY_BATCH_SIZE }),
      );
    } catch (err: unknown) {
      this.logger.error(
        `Outbox relay run failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isRelaying = false;
    }
  }
}
