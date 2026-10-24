import { IntegrationEventEnvelope } from '@org/contracts';

/**
 * Decodes a Kafka message value into an integration event envelope.
 *
 * @param value - Raw message value.
 * @returns The envelope, or `undefined` when the value is missing or not a valid envelope.
 */
export function parseEventEnvelope(
  value: Buffer | null,
): IntegrationEventEnvelope<Record<string, unknown>> | undefined {
  if (value === null) {
    return undefined;
  }
  try {
    const envelope: IntegrationEventEnvelope<Record<string, unknown>> =
      JSON.parse(value.toString('utf8'));
    return typeof envelope.eventType === 'string' &&
      typeof envelope.payload === 'object'
      ? envelope
      : undefined;
  } catch {
    return undefined;
  }
}
