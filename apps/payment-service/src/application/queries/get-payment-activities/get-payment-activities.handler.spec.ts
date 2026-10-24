import { Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { TEST_IDS } from '../../../testing/test-ids';
import { PaymentReadPort } from '../../ports/payment-read.port';
import { PaymentActivityReadModel } from '../../read-models/payment-activity.read-model';
import { GetPaymentActivitiesHandler } from './get-payment-activities.handler';
import { GetPaymentActivitiesQuery } from './get-payment-activities.query';

describe('GetPaymentActivitiesHandler', () => {
  let mockRead: jest.Mocked<PaymentReadPort>;
  let handler: GetPaymentActivitiesHandler;
  beforeEach(() => {
    mockRead = {
      findByOrderId: jest.fn(),
      findActivities: jest.fn(),
      findPaymentIdByTransactionId: jest.fn(),
    };
    handler = new GetPaymentActivitiesHandler(mockRead);
  });
  it('should return the activity log of the payment', async () => {
    // Arrange
    const expectedActivities: readonly PaymentActivityReadModel[] = [
      { action: 'PAYMENT_INITIATED' } as PaymentActivityReadModel,
    ];
    mockRead.findActivities.mockResolvedValue(expectedActivities);
    // Act
    const actualResult: Result<
      readonly PaymentActivityReadModel[],
      PaymentNotFoundError
    > = await handler.execute(
      new GetPaymentActivitiesQuery({ paymentId: TEST_IDS.PAYMENT }),
    );
    // Assert
    expect(actualResult.getValue()).toBe(expectedActivities);
    expect(mockRead.findActivities).toHaveBeenCalledWith(TEST_IDS.PAYMENT);
  });
  it('should fail with PaymentNotFoundError for an unknown payment', async () => {
    // Arrange
    mockRead.findActivities.mockResolvedValue(undefined);
    // Act
    const actualResult: Result<
      readonly PaymentActivityReadModel[],
      PaymentNotFoundError
    > = await handler.execute(
      new GetPaymentActivitiesQuery({ paymentId: TEST_IDS.PAYMENT }),
    );
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(PaymentNotFoundError);
  });
});
