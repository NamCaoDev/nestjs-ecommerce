import { IntegrationEventEnvelope } from '@org/contracts';
import type { EachMessagePayload } from 'kafkajs';

/**
 * Input of {@link readEventContext}.
 */
export interface ReadEventContextInput {
  readonly payload: EachMessagePayload;
  readonly envelope: IntegrationEventEnvelope<Record<string, unknown>>;
}
