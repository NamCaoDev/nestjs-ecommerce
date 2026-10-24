import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { PaymentOutcomeProcessor } from '../../services/payment-outcome-processor.service';
import { ProcessPaymentOutcomeInput } from '../../services/process-payment-outcome.input';
import { ProcessPaymentFailedCommand } from './process-payment-failed.command';
import { ProcessPaymentFailedHandler } from './process-payment-failed.handler';

describe('ProcessPaymentFailedHandler', () => {
  it('should cancel the order with the gateway reason through the inbox', async () => {
    // Arrange
    const mockProcessor: { readonly execute: jest.Mock } = {
      execute: jest.fn().mockResolvedValue(Result.ok('APPLIED')),
    };
    const mockOrder: { readonly cancel: jest.Mock } = {
      cancel: jest.fn().mockReturnValue(Result.ok()),
    };
    const handler: ProcessPaymentFailedHandler =
      new ProcessPaymentFailedHandler(
        mockProcessor as unknown as PaymentOutcomeProcessor,
      );
    // Act
    await handler.execute(
      new ProcessPaymentFailedCommand({
        eventId: 'e2',
        correlationId: 'o1',
        orderId: 'o1',
        reason: 'CARD_DECLINED',
        payload: { orderId: 'o1' },
      }),
    );
    // Assert
    const actualInput: ProcessPaymentOutcomeInput =
      mockProcessor.execute.mock.calls[0][0];
    expect(actualInput).toMatchObject({
      entry: { eventId: 'e2', eventType: 'payment.failed' },
      targetStatus: OrderStatus.CANCELLED,
    });
    const actualTransition: Result<void, DomainError> = actualInput.transition(
      mockOrder as unknown as Order,
    );
    expect(actualTransition.isSuccess).toBe(true);
    expect(mockOrder.cancel).toHaveBeenCalledWith(
      'PAYMENT_FAILED: CARD_DECLINED',
    );
  });
});
