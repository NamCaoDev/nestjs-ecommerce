import { CommandBus } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { createTestPayment } from '../../../testing/create-test-payment.util';
import { TEST_IDS } from '../../../testing/test-ids';
import { MockGatewaySimulatorPort } from '../../ports/mock-gateway-simulator.port';
import { ProcessWebhookCommand } from '../process-webhook/process-webhook.command';
import { SimulateGatewayPaymentCommand } from './simulate-gateway-payment.command';
import { SimulateGatewayPaymentHandler } from './simulate-gateway-payment.handler';
import { SimulateGatewayPaymentOutput } from './simulate-gateway-payment.output';

describe('SimulateGatewayPaymentHandler', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockRepository: jest.Mocked<PaymentRepositoryPort>;
  let mockSimulator: jest.Mocked<MockGatewaySimulatorPort>;
  let handler: SimulateGatewayPaymentHandler;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    mockRepository = {
      findById: jest.fn(),
      findByOrderId: jest.fn().mockResolvedValue(createTestPayment()),
      findByTransactionId: jest.fn(),
      saveNew: jest.fn(),
      save: jest.fn(),
    };
    mockSimulator = {
      buildSignedWebhook: jest.fn().mockReturnValue({
        headers: { 'x-webhook-signature': 'sig' },
        rawBody: '{}',
        gatewayTxId: 'mock_tx_1',
      }),
    };
    handler = new SimulateGatewayPaymentHandler(
      mockCommandBus as unknown as CommandBus,
      mockRepository,
      mockSimulator,
    );
  });
  it('should sign a webhook for the latest charge and deliver it as a MOCK webhook', async () => {
    // Arrange
    const inputCommand: SimulateGatewayPaymentCommand =
      new SimulateGatewayPaymentCommand({
        orderId: TEST_IDS.ORDER,
        status: 'FAILED',
        failureReason: 'CARD_DECLINED',
        ipAddress: '127.0.0.1',
      });
    // Act
    const actualResult: Result<SimulateGatewayPaymentOutput, DomainError> =
      await handler.execute(inputCommand);
    // Assert
    expect(mockSimulator.buildSignedWebhook).toHaveBeenCalledWith({
      transactionId: TEST_IDS.CHARGE,
      orderId: TEST_IDS.ORDER,
      amount: 10,
      status: 'FAILED',
      failureReason: 'CARD_DECLINED',
    });
    const actualWebhook: ProcessWebhookCommand =
      mockCommandBus.execute.mock.calls[0][0];
    expect(actualWebhook).toMatchObject({
      gateway: 'MOCK',
      headers: { 'x-webhook-signature': 'sig' },
      rawBody: '{}',
      ipAddress: '127.0.0.1',
    });
    expect(actualResult.getValue()).toEqual({
      orderId: TEST_IDS.ORDER,
      transactionId: TEST_IDS.CHARGE,
      gatewayTxId: 'mock_tx_1',
      status: 'FAILED',
    });
  });
  it('should fail for an order without payment', async () => {
    // Arrange
    mockRepository.findByOrderId.mockResolvedValue(undefined);
    // Act
    const actualResult: Result<SimulateGatewayPaymentOutput, DomainError> =
      await handler.execute(
        new SimulateGatewayPaymentCommand({
          orderId: TEST_IDS.ORDER,
          status: 'SUCCESS',
        }),
      );
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(PaymentNotFoundError);
    expect(mockCommandBus.execute).not.toHaveBeenCalled();
  });
  it('should return the rejection of the webhook', async () => {
    // Arrange
    const expectedError: PaymentNotFoundError = new PaymentNotFoundError('x');
    mockCommandBus.execute.mockResolvedValue(Result.fail(expectedError));
    // Act
    const actualResult: Result<SimulateGatewayPaymentOutput, DomainError> =
      await handler.execute(
        new SimulateGatewayPaymentCommand({
          orderId: TEST_IDS.ORDER,
          status: 'SUCCESS',
        }),
      );
    // Assert
    expect(actualResult.getError()).toBe(expectedError);
  });
});
