import { IntegrationEventEnvelope } from '@org/contracts';
import type { EachMessagePayload } from 'kafkajs';
import { IntegrationEventContext } from './integration-event-context.type';
import { readEventContext } from './read-event-context.util';

const ENVELOPE: IntegrationEventEnvelope<Record<string, unknown>> = {
  eventId: 'envelope-id',
  eventType: 'payment.succeeded',
  aggregateId: 'p1',
  occurredAt: 1,
  payload: {},
};

describe('readEventContext', () => {
  it('should prefer the headers, including repeated values', () => {
    // Arrange
    const inputPayload: EachMessagePayload = {
      topic: 'payments.events',
      partition: 1,
      message: {
        offset: '7',
        headers: {
          'event-id': Buffer.from('header-id'),
          'x-correlation-id': [Buffer.from('corr-1'), Buffer.from('corr-2')],
        },
      },
    } as unknown as EachMessagePayload;
    // Act
    const actualContext: IntegrationEventContext = readEventContext({
      payload: inputPayload,
      envelope: ENVELOPE,
    });
    // Assert
    expect(actualContext).toEqual({
      eventId: 'header-id',
      correlationId: 'corr-1',
      topic: 'payments.events',
      partition: 1,
      offset: '7',
    });
  });
  it('should fall back to the envelope event id', () => {
    // Arrange
    const inputPayload: EachMessagePayload = {
      topic: 'payments.events',
      partition: 0,
      message: { offset: '0' },
    } as unknown as EachMessagePayload;
    // Act
    const actualContext: IntegrationEventContext = readEventContext({
      payload: inputPayload,
      envelope: ENVELOPE,
    });
    // Assert
    expect(actualContext).toMatchObject({
      eventId: 'envelope-id',
      correlationId: 'envelope-id',
    });
  });
});
