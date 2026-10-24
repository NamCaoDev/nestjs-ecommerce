import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DomainError, Result } from '@org/shared-domain';
import { readBooleanEnv } from '@org/shared-infrastructure';
import type { Request } from 'express';
import { SimulateGatewayPaymentCommand } from '../../application/commands/simulate-gateway-payment/simulate-gateway-payment.command';
import { SimulateGatewayPaymentOutput } from '../../application/commands/simulate-gateway-payment/simulate-gateway-payment.output';
import { ErrorResponseDoc } from './docs/error-response.doc';
import { SimulatedWebhookDoc } from './docs/simulated-webhook.doc';
import { MockGatewayPayDto } from './dto/mock-gateway-pay.dto';

/**
 * Development stand-in for the customer paying at the MOCK gateway: signs the webhook the gateway would
 * send (HMAC-SHA256) and processes it like `POST /payments/webhook/mock`. Answers 404 when
 * `MOCK_GATEWAY_ENABLED=false`, which every production deployment must set.
 */
@ApiTags('mock-gateway')
@Controller('payments/mock-gateway')
export class MockGatewayController {
  private readonly isEnabled: boolean = readBooleanEnv({
    name: 'MOCK_GATEWAY_ENABLED',
    defaultValue: true,
  });

  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {}

  /**
   * Completes the latest MOCK charge of an order with the given result.
   *
   * @param dto - Order and result.
   * @param req - Request, for the caller IP.
   * @returns The webhook that was delivered.
   */
  @ApiOperation({
    summary: 'Simulate the gateway result of a payment (development only)',
  })
  @ApiOkResponse({ type: SimulatedWebhookDoc })
  @ApiNotFoundResponse({
    type: ErrorResponseDoc,
    description: 'Mock gateway disabled, or the order has no payment yet.',
  })
  @Post('pay')
  @HttpCode(HttpStatus.OK)
  public async pay(
    @Body() dto: MockGatewayPayDto,
    @Req() req: Request,
  ): Promise<SimulateGatewayPaymentOutput> {
    if (!this.isEnabled) {
      throw new NotFoundException();
    }
    const result: Result<SimulateGatewayPaymentOutput, DomainError> =
      await this.commandBus.execute(
        new SimulateGatewayPaymentCommand({ ...dto, ipAddress: req.ip }),
      );
    if (result.isFailure) {
      throw result.getError();
    }
    return result.getValue();
  }
}
