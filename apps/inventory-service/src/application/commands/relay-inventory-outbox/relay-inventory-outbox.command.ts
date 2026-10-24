import { Command } from '@nestjs/cqrs';
import { RelayInventoryOutboxOutput } from './relay-inventory-outbox.output';

/**
 * Command applying one batch of pending inventory outbox events to Redis.
 * Handled by {@link RelayInventoryOutboxHandler}.
 */
export class RelayInventoryOutboxCommand extends Command<RelayInventoryOutboxOutput> {
  /** Maximum number of events relayed by this run. */
  public readonly batchSize: number;

  /**
   * @param props - Batch size of the run.
   */
  public constructor({ batchSize }: { readonly batchSize: number }) {
    super();
    this.batchSize = batchSize;
  }
}
