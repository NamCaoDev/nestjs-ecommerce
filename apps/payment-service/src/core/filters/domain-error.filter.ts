import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainError } from '@org/shared-domain';
import type { Response } from 'express';
import { GatewayRefundFailedError } from '../../application/errors/gateway-refund-failed.error';
import { InvalidWebhookSignatureError } from '../../application/errors/invalid-webhook-signature.error';
import { DuplicatePaymentError } from '../../domain/errors/duplicate-payment.error';
import { GatewayOperationNotSupportedError } from '../../domain/errors/gateway-operation-not-supported.error';
import { PaymentConcurrencyConflictError } from '../../domain/errors/payment-concurrency-conflict.error';
import { PaymentNotFoundError } from '../../domain/errors/payment-not-found.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { UnsupportedGatewayError } from '../../domain/errors/unsupported-gateway.error';

/** JSON body returned for a domain error. */
interface DomainErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

/** HTTP status of each error type that is not a plain business rule violation (400). */
const STATUS_BY_ERROR: ReadonlyArray<
  readonly [abstract new (...args: never[]) => DomainError, HttpStatus]
> = [
  [InvalidWebhookSignatureError, HttpStatus.UNAUTHORIZED],
  [PaymentNotFoundError, HttpStatus.NOT_FOUND],
  [TransactionNotFoundError, HttpStatus.NOT_FOUND],
  [UnsupportedGatewayError, HttpStatus.NOT_FOUND],
  [PaymentConcurrencyConflictError, HttpStatus.CONFLICT],
  [DuplicatePaymentError, HttpStatus.CONFLICT],
  [GatewayOperationNotSupportedError, HttpStatus.NOT_IMPLEMENTED],
  [GatewayRefundFailedError, HttpStatus.BAD_GATEWAY],
];

/**
 * Converts {@link DomainError}s into HTTP responses (CLAUDE.md §2.D): a bad webhook signature is 401; an
 * unknown payment, charge or gateway is 404 (a gateway retries a webhook that arrives before the payment
 * exists); a concurrent change or duplicate is 409; an operation a gateway does not offer is 501; a
 * refund the gateway refuses is 502; every other business rule violation (malformed webhook, wrong
 * amount, refund not allowed) is 400. HTTP contexts only.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  /**
   * @param error - Domain error thrown by a controller.
   * @param host - Execution context.
   */
  public catch(error: DomainError, host: ArgumentsHost): void {
    const statusCode: HttpStatus = DomainErrorFilter.resolveStatus(error);
    const body: DomainErrorBody = {
      statusCode,
      code: error.code,
      message: error.message,
    };
    host.switchToHttp().getResponse<Response>().status(statusCode).json(body);
  }

  /**
   * @returns The HTTP status for the error.
   */
  private static resolveStatus(error: DomainError): HttpStatus {
    const match:
      | readonly [abstract new (...args: never[]) => DomainError, HttpStatus]
      | undefined = STATUS_BY_ERROR.find(
      ([errorType]: readonly [
        abstract new (...args: never[]) => DomainError,
        HttpStatus,
      ]): boolean => error instanceof errorType,
    );
    return match?.[1] ?? HttpStatus.BAD_REQUEST;
  }
}
