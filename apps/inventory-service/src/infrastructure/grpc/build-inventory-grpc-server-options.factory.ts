import { GrpcOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { readEnv } from '@org/shared-infrastructure';

/** gRPC port used when `INVENTORY_GRPC_PORT` is not set. */
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
 * Builds the gRPC server options from `INVENTORY_GRPC_PORT` and `INVENTORY_PROTO_PATH`
 * (defaults: `0.0.0.0:50051`, `dist/proto/inventory.proto`).
 *
 * @returns Nest gRPC microservice options.
 */
export function buildInventoryGrpcServerOptions(): GrpcOptions {
  const port: string = readEnv({
    name: 'INVENTORY_GRPC_PORT',
    defaultValue: DEFAULT_INVENTORY_GRPC_PORT,
  });
  return {
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${port}`,
      package: INVENTORY_PROTO_PACKAGE,
      protoPath: readEnv({
        name: 'INVENTORY_PROTO_PATH',
        defaultValue: DEFAULT_INVENTORY_PROTO_PATH,
      }),
      loader: { keepCase: false, defaults: true },
    },
  };
}
