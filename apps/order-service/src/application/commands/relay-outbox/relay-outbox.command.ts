import { Command } from '@nestjs/cqrs';
import { RelayOutboxOutput } from './relay-outbox.output';

/**
 * Command publishing one batch of pending outbox messages. Handled by {@link RelayOutboxHandler}.
 */
export class RelayOutboxCommand extends Command<RelayOutboxOutput> {
  /** Maximum number of messages relayed by this run. */
  public readonly batchSize: number;

  /**
   * @param props - Batch size of the run.
   */
  public constructor({ batchSize }: { readonly batchSize: number }) {
    super();
    this.batchSize = batchSize;
  }
}
