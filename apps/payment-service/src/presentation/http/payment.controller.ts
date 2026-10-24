import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError, Result } from '@org/shared-domain';
import type { Request } from 'express';
import { ProcessWebhookCommand } from '../../application/commands/process-webhook/process-webhook.command';
import { RefundPaymentCommand } from '../../application/commands/refund-payment/refund-payment.command';
import { RefundPaymentOutput } from '../../application/commands/refund-payment/refund-payment.output';
import { GetPaymentActivitiesQuery } from '../../application/queries/get-payment-activities/get-payment-activities.query';
import { GetPaymentByOrderIdQuery } from '../../application/queries/get-payment-by-order-id/get-payment-by-order-id.query';
import type { PaymentActivityReadModel } from '../../application/read-models/payment-activity.read-model';
import type { PaymentReadModel } from '../../application/read-models/payment.read-model';
import type { PaymentGatewayProvider } from '../../domain/types/payment-gateway-provider.type';
import { IdempotencyKeyHeader } from './decorators/idempotency-key-header.decorator';
import { ErrorResponseDoc } from './docs/error-response.doc';
import { PaymentActivityDoc } from './docs/payment-activity.doc';
import { PaymentDoc } from './docs/payment.doc';
import { RefundDoc } from './docs/refund.doc';
import { SmokeTestResponseDoc } from './docs/smoke-test-response.doc';
import { WebhookAckDoc } from './docs/webhook-ack.doc';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { GatewayProviderPipe } from './pipes/gateway-provider.pipe';
import { IdempotencyKeyPipe } from './pipes/idempotency-key.pipe';
import type { SmokeTestResponse } from './smoke-test.response';
import { toHeaderRecord } from './to-header-record.util';
import type { WebhookAckResponse } from './webhook-ack.response';

/** Name reported by the smoke-test endpoint. */
const SERVICE_NAME = 'payment-service';

/** Optional header naming the operator of an admin action (until authentication exists). */
const ACTOR_HEADER = 'x-actor-id';

/** Base of the URLs parsed for their query string. */
const URL_BASE = 'http://localhost';

/**
 * REST endpoints of the payment resource: gateway webhooks, the payment of an order, its activity log
 * and refunds. Failed results are thrown as domain errors and mapped by the global `DomainErrorFilter`.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  /**
   * @param commandBus - CQRS command bus.
   * @param queryBus - CQRS query bus.
   */
  public constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Receives the asynchronous result of a payment from a gateway.
   *
   * @param gateway - Gateway segment (`mock`, `vnpay`, `vietqr-va`, ...).
   * @param req - Request; its raw body (or query string) is what the gateway signed.
   * @returns An acknowledgement (HTTP 200), also for a charge that is already final.
   */
  @ApiOperation({
    summary: 'Payment gateway webhook',
    description:
      'The gateway adapter verifies the signature of the raw body (or query string). A rejected call is recorded in the activity log. A verified result finalises the PENDING charge and saves the payment, ledger, activity rows and payment.succeeded / payment.failed outbox message in one transaction; a charge that is already final is acknowledged unchanged.',
  })
  @ApiParam({ name: 'gateway', example: 'mock' })
  @ApiOkResponse({ type: WebhookAckDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'Malformed payload or wrong amount.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDoc,
    description: 'Signature mismatch.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDoc,
    description: 'Unknown gateway or charge.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDoc,
    description: 'Concurrent delivery; the gateway retries.',
  })
  @Post('webhook/:gateway')
  @HttpCode(HttpStatus.OK)
  public async receiveWebhook(
    @Param('gateway', GatewayProviderPipe) gateway: PaymentGatewayProvider,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<WebhookAckResponse> {
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new ProcessWebhookCommand({
        gateway,
        headers: toHeaderRecord(req.headers),
        rawBody:
          req.rawBody?.toString('utf8') ||
          new URL(req.originalUrl, URL_BASE).search.replace(/^\?/, ''),
        ipAddress: req.ip,
      }),
    );
    if (result.isFailure) {
      throw result.getError();
    }
    return { received: true };
  }

  /**
   * Reads the payment of an order.
   *
   * @param orderId - Order UUID.
   * @returns The payment with its ledger (HTTP 404 when the order has none yet).
   */
  @ApiOperation({ summary: 'Get the payment of an order, with its ledger' })
  @ApiOkResponse({ type: PaymentDoc })
  @ApiNotFoundResponse({ type: ErrorResponseDoc })
  @Get('orders/:orderId')
  public async getPaymentByOrderId(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentReadModel> {
    const result: Result<PaymentReadModel, DomainError> =
      await this.queryBus.execute(new GetPaymentByOrderIdQuery({ orderId }));
    if (result.isFailure) {
      throw result.getError();
    }
    return result.getValue();
  }

  /**
   * Reads the activity log of a payment, oldest first.
   *
   * @param paymentId - Payment UUID.
   * @returns The activities (HTTP 404 for an unknown payment).
   */
  @ApiOperation({ summary: 'Activity log of a payment, oldest first' })
  @ApiOkResponse({ type: [PaymentActivityDoc] })
  @ApiNotFoundResponse({ type: ErrorResponseDoc })
  @Get(':id/activities')
  public async getActivities(
    @Param('id', ParseUUIDPipe) paymentId: string,
  ): Promise<readonly PaymentActivityReadModel[]> {
    const result: Result<readonly PaymentActivityReadModel[], DomainError> =
      await this.queryBus.execute(new GetPaymentActivitiesQuery({ paymentId }));
    if (result.isFailure) {
      throw result.getError();
    }
    return result.getValue();
  }

  /**
   * Refunds (part of) a paid payment.
   *
   * @param paymentId - Payment UUID.
   * @param idempotencyKey - Required `Idempotency-Key` header.
   * @param dto - Amount and reason.
   * @param req - Request, for the operator and IP.
   * @returns The payment after the refund.
   */
  @ApiOperation({
    summary: 'Refund (part of) a paid payment',
    description:
      'Refunds through the gateway of the paid charge, appends a REFUND ledger entry and raises refundedAmount; totalAmount never changes. A replay with the same Idempotency-Key returns the recorded refund.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({
    name: ACTOR_HEADER,
    required: false,
    description: 'Operator id, recorded in the activity log.',
  })
  @ApiOkResponse({ type: RefundDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'Not refundable, or above the refundable amount.',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDoc })
  @Post(':id/refunds')
  @HttpCode(HttpStatus.OK)
  public async refund(
    @Param('id', ParseUUIDPipe) paymentId: string,
    @IdempotencyKeyHeader(IdempotencyKeyPipe) idempotencyKey: string,
    @Body() dto: RefundPaymentDto,
    @Req() req: Request,
  ): Promise<RefundPaymentOutput> {
    const result: Result<RefundPaymentOutput, DomainError> =
      await this.commandBus.execute(
        new RefundPaymentCommand({
          paymentId,
          amount: dto.amount,
          reason: dto.reason,
          idempotencyKey,
          actorId: req.header(ACTOR_HEADER),
          ipAddress: req.ip,
        }),
      );
    if (result.isFailure) {
      throw result.getError();
    }
    return result.getValue();
  }

  /**
   * Smoke test of the payment controller (CLAUDE.md §2.D: `admin/test`).
   *
   * @returns Liveness information.
   */
  @ApiOperation({ summary: 'Smoke test of the payment controller' })
  @ApiOkResponse({ type: SmokeTestResponseDoc })
  @Get('admin/test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }
}
