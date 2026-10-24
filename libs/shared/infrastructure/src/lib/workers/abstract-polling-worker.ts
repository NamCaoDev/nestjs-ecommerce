import {
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { readBooleanEnv } from '../env/read-boolean-env.util';
import { readEnv } from '../env/read-env.util';
import { PollingWorkerProps } from './polling-worker.props';

/**
 * Base of background workers that run a tick on a fixed interval: starts on bootstrap unless its
 * flag is `false`, never overlaps two ticks, logs a failed tick and tries again on the next one,
 * and stops on shutdown.
 */
export abstract class AbstractPollingWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  protected readonly logger: Logger;
  private readonly props: PollingWorkerProps;
  private timer: NodeJS.Timeout | undefined;
  private isTicking: boolean = false;

  /**
   * @param props - Flag and interval configuration.
   */
  protected constructor(props: PollingWorkerProps) {
    this.logger = new Logger(new.target.name);
    this.props = props;
  }

  /**
   * Starts the interval.
   */
  public onApplicationBootstrap(): void {
    if (!readBooleanEnv({ name: this.props.enabledFlag, defaultValue: true })) {
      this.logger.log(`Disabled by ${this.props.enabledFlag}`);
      return;
    }
    const intervalMs: number = Number(
      readEnv({
        name: this.props.intervalVariable,
        defaultValue: String(this.props.defaultIntervalMs),
      }),
    );
    this.timer = setInterval((): void => {
      void this.executeRun();
    }, intervalMs);
  }

  /**
   * Stops the interval.
   */
  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Runs one tick unless the previous one is still running; a failure is logged.
   */
  public async executeRun(): Promise<void> {
    if (this.isTicking) {
      return;
    }
    this.isTicking = true;
    try {
      await this.executeTick();
    } catch (err: unknown) {
      this.logger.error(
        `Tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Work done on each tick.
   */
  protected abstract executeTick(): Promise<void>;
}
