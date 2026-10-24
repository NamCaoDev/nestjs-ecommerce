import { Body, Controller, Get, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { CreateOrderCommand } from '../../application/commands/create-order/create-order.command';
import { CreateOrderOutput } from '../../application/commands/create-order/create-order.output';
import type { CreateOrderResponse } from './create-order.response';
import { IdempotencyKeyHeader } from './decorators/idempotency-key-header.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { IdempotencyKeyPipe } from './pipes/idempotency-key.pipe';
import type { SmokeTestResponse } from './smoke-test.response';

/** Name reported by the smoke-test endpoint. */
const SERVICE_NAME = 'order-service';

/**
 * REST endpoints of the order resource. Failed results are thrown as domain errors and mapped
 * to HTTP statuses by the global `DomainErrorFilter` (409 duplicate, 400 other business errors).
 */
@Controller('orders')
export class OrderController {
  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {}

  /**
   * Places an order.
   *
   * @param idempotencyKey - Required `Idempotency-Key` header.
   * @param dto - Validated order request.
   * @returns The placed order summary (HTTP 201).
   */
  @Post()
  public async createOrder(
    @IdempotencyKeyHeader(IdempotencyKeyPipe) idempotencyKey: string,
    @Body() dto: CreateOrderDto,
  ): Promise<CreateOrderResponse> {
    const result: Result<CreateOrderOutput, Error> =
      await this.commandBus.execute(
        new CreateOrderCommand({ ...dto, idempotencyKey }),
      );
    if (result.isFailure) {
      throw result.getError();
    }
    return result.getValue();
  }

  /**
   * Smoke test of the order controller (CLAUDE.md §3: `admin/test`).
   *
   * @returns Liveness information.
   */
  @Get('admin/test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }
}
