import { DomainError, Result } from '@org/shared-domain';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { PaymentOutcomeProcessor } from '../../services/payment-outcome-processor.service';
import { ProcessPaymentOutcomeInput } from '../../services/process-payment-outcome.input';
import { PaymentOutcome } from '../../services/payment-outcome.type';
import { ProcessPaymentSucceededCommand } from './process-payment-succeeded.command';
import { ProcessPaymentSucceededHandler } from './process-payment-succeeded.handler';

describe('ProcessPaymentSucceededHandler', () => {
  it('should confirm the order through the inbox, keyed by the event id', async () => {
    // Arrange
    const mockProcessor: { readonly execute: jest.Mock } = {
      execute: jest.fn().mockResolvedValue(Result.ok('APPLIED')),
    };
    const handler: ProcessPaymentSucceededHandler =
      new ProcessPaymentSucceededHandler(
        mockProcessor as unknown as PaymentOutcomeProcessor,
      );
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await handler.execute(
        new ProcessPaymentSucceededCommand({
          eventId: 'e1',
          correlationId: 'o1',
          orderId: 'o1',
          payload: { orderId: 'o1' },
        }),
      );
    // Assert
    const actualInput: ProcessPaymentOutcomeInput =
      mockProcessor.execute.mock.calls[0][0];
    expect(actualResult.getValue()).toBe('APPLIED');
    expect(actualInput).toMatchObject({
      entry: {
        eventId: 'e1',
        eventType: 'payment.succeeded',
        source: 'payment-service',
        payload: { orderId: 'o1' },
      },
      orderId: 'o1',
      targetStatus: OrderStatus.CONFIRMED,
    });
  });
});
