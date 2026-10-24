import { Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { TEST_IDS } from '../../../testing/test-ids';
import { PaymentReadPort } from '../../ports/payment-read.port';
import { PaymentReadModel } from '../../read-models/payment.read-model';
import { GetPaymentByOrderIdHandler } from './get-payment-by-order-id.handler';
import { GetPaymentByOrderIdQuery } from './get-payment-by-order-id.query';

describe('GetPaymentByOrderIdHandler', () => {
  let mockRead: jest.Mocked<PaymentReadPort>;
  let handler: GetPaymentByOrderIdHandler;
  beforeEach(() => {
    mockRead = {
      findByOrderId: jest.fn(),
      findActivities: jest.fn(),
      findPaymentIdByTransactionId: jest.fn(),
    };
    handler = new GetPaymentByOrderIdHandler(mockRead);
  });
  it('should return the payment of the order', async () => {
    // Arrange
    const expectedPayment: PaymentReadModel = {
      orderId: TEST_IDS.ORDER,
    } as PaymentReadModel;
    mockRead.findByOrderId.mockResolvedValue(expectedPayment);
    // Act
    const actualResult: Result<PaymentReadModel, PaymentNotFoundError> =
      await handler.execute(
        new GetPaymentByOrderIdQuery({ orderId: TEST_IDS.ORDER }),
      );
    // Assert
    expect(actualResult.getValue()).toBe(expectedPayment);
  });
  it('should fail with PaymentNotFoundError for an order without payment', async () => {
    // Arrange
    mockRead.findByOrderId.mockResolvedValue(undefined);
    // Act
    const actualResult: Result<PaymentReadModel, PaymentNotFoundError> =
      await handler.execute(
        new GetPaymentByOrderIdQuery({ orderId: TEST_IDS.ORDER }),
      );
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(PaymentNotFoundError);
  });
});
