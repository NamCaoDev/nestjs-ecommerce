import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainError } from '@org/shared-domain';
import type { Response } from 'express';
import { DuplicateRequestError } from '../../application/errors/duplicate-request.error';

/** JSON body returned for a domain error. */
interface DomainErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

/**
 * Converts {@link DomainError}s into HTTP responses (CLAUDE.md §3, Core Module):
 * a duplicate Idempotency-Key is `409 Conflict`; every other business rule violation,
 * including an out-of-stock reservation, is `400 Bad Request`. HTTP contexts only.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  /**
   * @param error - Domain error thrown by a handler.
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
    if (error instanceof DuplicateRequestError) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.BAD_REQUEST;
  }
}
