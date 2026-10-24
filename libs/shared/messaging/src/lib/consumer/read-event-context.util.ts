import type { IHeaders } from 'kafkajs';
import { EVENT_HEADERS } from './event-headers';
import { IntegrationEventContext } from './integration-event-context.type';
import { ReadEventContextInput } from './read-event-context.input';

/**
 * @returns The text value of a header, if present.
 */
const readHeader = (
  headers: IHeaders | undefined,
  name: string,
): string | undefined => {
  const value: unknown = headers?.[name];
  const first: unknown = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === null ? undefined : String(first);
};

/**
 * Reads the delivery metadata of a message: event id and correlation id from the headers, falling back
 * to the envelope event id.
 *
 * @param input - Kafka payload and decoded envelope.
 * @returns The event context.
 */
export function readEventContext({
  payload,
  envelope,
}: ReadEventContextInput): IntegrationEventContext {
  const { headers, offset } = payload.message;
  const eventId: string =
    readHeader(headers, EVENT_HEADERS.EVENT_ID) ?? String(envelope.eventId);
  return {
    eventId,
    correlationId: readHeader(headers, EVENT_HEADERS.CORRELATION_ID) ?? eventId,
    topic: payload.topic,
    partition: payload.partition,
    offset,
  };
}
