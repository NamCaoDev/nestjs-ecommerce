import { DomainError } from '@org/shared-domain';

/**
 * Raised when a gateway adapter does not (yet) offer an operation, e.g. refunds of bank transfers.
 */
export class GatewayOperationNotSupportedError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.GATEWAY_OPERATION_NOT_SUPPORTED';

  /**
   * @param details - Gateway and operation.
   */
  public constructor({
    gateway,
    operation,
  }: {
    readonly gateway: string;
    readonly operation: string;
  }) {
    super(`Gateway ${gateway} does not support ${operation}.`);
  }
}
