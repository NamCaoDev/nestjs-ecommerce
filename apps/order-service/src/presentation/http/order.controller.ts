import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { CreateOrderCommand } from '../../application/commands/create-order/create-order.command';
import { CreateOrderOutput } from '../../application/commands/create-order/create-order.output';
import { GetOrderByIdQuery } from '../../application/queries/get-order-by-id/get-order-by-id.query';
import { GetOrdersByCustomerQuery } from '../../application/queries/get-orders-by-customer/get-orders-by-customer.query';
import type { OrderReadModel } from '../../application/read-models/order.read-model';
import type { OrdersPageReadModel } from '../../application/read-models/orders-page.read-model';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import type { CreateOrderResponse } from './create-order.response';
import { IdempotencyKeyHeader } from './decorators/idempotency-key-header.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetOrdersQueryDto } from './dto/get-orders.query-dto';
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
   * @param queryBus - CQRS query bus.
   */
  public constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

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
   * Lists a customer's orders, newest first.
   *
   * @param query - Validated `customerId`, `page` (default 1) and `limit` (default 20, max 100).
   * @returns One page of orders.
   */
  @Get()
  public listOrders(
    @Query() query: GetOrdersQueryDto,
  ): Promise<OrdersPageReadModel> {
    return this.queryBus.execute(new GetOrdersByCustomerQuery(query));
  }

  /**
   * Reads one order.
   *
   * @param orderId - Order UUID.
   * @returns The order (HTTP 404 when unknown, 400 when not a UUID).
   */
  @Get(':id')
  public async getOrder(
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderReadModel> {
    const result: Result<OrderReadModel, OrderNotFoundError> =
      await this.queryBus.execute(new GetOrderByIdQuery({ orderId }));
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
