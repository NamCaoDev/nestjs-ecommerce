import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { DomainError } from '@org/shared-domain';
import { Observable, throwError } from 'rxjs';

/** Error shape understood by the Nest gRPC transport. */
interface GrpcErrorBody {
  readonly code: GrpcStatus;
  readonly message: string;
}

/**
 * Converts {@link DomainError}s raised by gRPC handlers into `INVALID_ARGUMENT` (CLAUDE.md §3, Core Module).
 * The domain error code is prefixed to the message so callers can still branch on it.
 */
@Catch(DomainError)
export class DomainErrorRpcFilter implements RpcExceptionFilter<DomainError> {
  /**
   * @param error - Domain error thrown by a handler.
   * @returns An observable erroring with the gRPC status.
   */
  public catch(error: DomainError): Observable<never> {
    const body: GrpcErrorBody = {
      code: GrpcStatus.INVALID_ARGUMENT,
      message: `${error.code}: ${error.message}`,
    };
    return throwError((): GrpcErrorBody => body);
  }
}
