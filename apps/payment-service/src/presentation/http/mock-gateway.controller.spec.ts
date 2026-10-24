import { NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import type { Request } from 'express';
import { SimulateGatewayPaymentCommand } from '../../application/commands/simulate-gateway-payment/simulate-gateway-payment.command';
import { SimulateGatewayPaymentOutput } from '../../application/commands/simulate-gateway-payment/simulate-gateway-payment.output';
import { PaymentNotFoundError } from '../../domain/errors/payment-not-found.error';
import { TEST_IDS } from '../../testing/test-ids';
import { MockGatewayPayDto } from './dto/mock-gateway-pay.dto';
import { MockGatewayController } from './mock-gateway.controller';

const INPUT_DTO: MockGatewayPayDto = {
  orderId: TEST_IDS.ORDER,
  status: 'SUCCESS',
};
const INPUT_REQUEST: Request = { ip: '127.0.0.1' } as Request;

describe('MockGatewayController', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn() };
  });
  afterEach(() => {
    delete process.env['MOCK_GATEWAY_ENABLED'];
  });
  it('should dispatch SimulateGatewayPaymentCommand with the caller IP', async () => {
    // Arrange
    const expectedOutput: SimulateGatewayPaymentOutput = {
      orderId: TEST_IDS.ORDER,
      transactionId: TEST_IDS.CHARGE,
      gatewayTxId: 'mock_tx_1',
      status: 'SUCCESS',
    };
    mockCommandBus.execute.mockResolvedValue(Result.ok(expectedOutput));
    const controller: MockGatewayController = new MockGatewayController(
      mockCommandBus as unknown as CommandBus,
    );
    // Act
    const actualOutput: SimulateGatewayPaymentOutput = await controller.pay(
      INPUT_DTO,
      INPUT_REQUEST,
    );
    // Assert
    const actualCommand: SimulateGatewayPaymentCommand =
      mockCommandBus.execute.mock.calls[0][0];
    expect(actualCommand).toMatchObject({
      orderId: TEST_IDS.ORDER,
      status: 'SUCCESS',
      ipAddress: '127.0.0.1',
    });
    expect(actualOutput).toBe(expectedOutput);
  });
  it('should throw the rejection for the global filter', async () => {
    // Arrange
    const expectedError: PaymentNotFoundError = new PaymentNotFoundError('x');
    mockCommandBus.execute.mockResolvedValue(Result.fail(expectedError));
    const controller: MockGatewayController = new MockGatewayController(
      mockCommandBus as unknown as CommandBus,
    );
    // Act
    const actualCall: Promise<SimulateGatewayPaymentOutput> = controller.pay(
      INPUT_DTO,
      INPUT_REQUEST,
    );
    // Assert
    await expect(actualCall).rejects.toBe(expectedError);
  });
  it('should answer 404 when MOCK_GATEWAY_ENABLED is false', async () => {
    // Arrange
    process.env['MOCK_GATEWAY_ENABLED'] = 'false';
    const controller: MockGatewayController = new MockGatewayController(
      mockCommandBus as unknown as CommandBus,
    );
    // Act
    const actualCall: Promise<SimulateGatewayPaymentOutput> = controller.pay(
      INPUT_DTO,
      INPUT_REQUEST,
    );
    // Assert
    await expect(actualCall).rejects.toBeInstanceOf(NotFoundException);
    expect(mockCommandBus.execute).not.toHaveBeenCalled();
  });
});
