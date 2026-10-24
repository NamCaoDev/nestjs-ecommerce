import { GrpcOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { readEnv } from '@org/shared-infrastructure';

/** Inventory gRPC host used when `INVENTORY_GRPC_HOST` is not set. */
const DEFAULT_INVENTORY_GRPC_HOST = 'localhost';

/** Inventory gRPC port used when `INVENTORY_GRPC_PORT` is not set. */
const DEFAULT_INVENTORY_GRPC_PORT = '50051';

/** Proto copied next to the bundle by the webpack `assets` option. */
const DEFAULT_INVENTORY_PROTO_PATH: string = join(
  __dirname,
  'proto',
  'inventory.proto',
);

/** Protobuf package declared in `libs/proto/inventory.proto`. */
const INVENTORY_PROTO_PACKAGE = 'inventory.v1';

/**
 * Builds the inventory gRPC client options from `INVENTORY_GRPC_HOST`, `INVENTORY_GRPC_PORT`
 * and `INVENTORY_PROTO_PATH` (defaults: `localhost:50051`, `dist/proto/inventory.proto`).
 *
 * @returns Nest gRPC client options.
 */
export function buildInventoryGrpcClientOptions(): GrpcOptions {
  const host: string = readEnv({
    name: 'INVENTORY_GRPC_HOST',
    defaultValue: DEFAULT_INVENTORY_GRPC_HOST,
  });
  const port: string = readEnv({
    name: 'INVENTORY_GRPC_PORT',
    defaultValue: DEFAULT_INVENTORY_GRPC_PORT,
  });
  return {
    transport: Transport.GRPC,
    options: {
      url: `${host}:${port}`,
      package: INVENTORY_PROTO_PACKAGE,
      protoPath: readEnv({
        name: 'INVENTORY_PROTO_PATH',
        defaultValue: DEFAULT_INVENTORY_PROTO_PATH,
      }),
      loader: { keepCase: false, defaults: true },
    },
  };
}
