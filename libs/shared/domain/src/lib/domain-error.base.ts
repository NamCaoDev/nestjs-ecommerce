/**
 * Base class for expected business-rule failures raised by the domain.
 *
 * Domain errors are returned through {@link Result.fail} for expected outcomes, or thrown when an
 * aggregate invariant is violated. The stable {@link DomainError.code} lets the global exception
 * filter map them to HTTP / gRPC status codes without parsing messages.
 *
 * @example
 * class InsufficientStockError extends DomainError {
 *   public readonly code: string = 'INVENTORY.INSUFFICIENT_STOCK';
 *
 *   public constructor(sku: string) {
 *     super(`Insufficient stock for SKU ${sku}`);
 *   }
 * }
 */
export abstract class DomainError extends Error {
  /** Stable, machine-readable error code, e.g. `ORDER.ALREADY_CANCELLED`. */
  public abstract readonly code: string;

  /**
   * @param message - Human-readable description of the failure.
   * @param options - Standard error options, e.g. the underlying `cause`.
   */
  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
