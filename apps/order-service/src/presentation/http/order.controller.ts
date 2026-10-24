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
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import { CreateOrderResponseDoc } from './docs/create-order-response.doc';
import { ErrorResponseDoc } from './docs/error-response.doc';
import { OrderDoc } from './docs/order.doc';
import { OrdersPageDoc } from './docs/orders-page.doc';
import { SmokeTestResponseDoc } from './docs/smoke-test-response.doc';
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
@ApiTags('orders')
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
  @ApiOperation({
    summary: 'Place an order',
    description:
      'Reserves stock through the inventory service, then stores the order and its order.placed event in one transaction.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique per customer and request (max 128 characters); retries must reuse it.',
  })
  @ApiCreatedResponse({ type: CreateOrderResponseDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description:
      'Missing header, invalid body, business rule violation or stock not available.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDoc,
    description: 'Idempotency-Key already used.',
  })
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
  @ApiOperation({ summary: "List a customer's orders, newest first" })
  @ApiOkResponse({ type: OrdersPageDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'Invalid customerId, page or limit.',
  })
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
  @ApiOperation({ summary: 'Get one order' })
  @ApiOkResponse({ type: OrderDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'The id is not a UUID.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDoc,
    description: 'Unknown order.',
  })
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
  @ApiOperation({ summary: 'Smoke test of the order controller' })
  @ApiOkResponse({ type: SmokeTestResponseDoc })
  @Get('admin/test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }
}
