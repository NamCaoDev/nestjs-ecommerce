/**
 * Dependency-injection token of the Nest gRPC client for the inventory service.
 */
export const INVENTORY_GRPC_CLIENT: unique symbol = Symbol(
  'INVENTORY_GRPC_CLIENT',
);
