import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { INVENTORY_RPC_PORT } from '../../../application/ports/inventory-rpc.token';
import { buildInventoryGrpcClientOptions } from './build-inventory-grpc-client-options.factory';
import { InventoryGrpcClientAdapter } from './inventory-grpc-client.adapter';
import { INVENTORY_GRPC_CLIENT } from './inventory-grpc-client.token';

/**
 * Binds {@link INVENTORY_RPC_PORT} to the gRPC client of the inventory service.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: INVENTORY_GRPC_CLIENT,
        useFactory: buildInventoryGrpcClientOptions,
      },
    ]),
  ],
  providers: [
    { provide: INVENTORY_RPC_PORT, useClass: InventoryGrpcClientAdapter },
  ],
  exports: [INVENTORY_RPC_PORT],
})
export class InventoryGrpcModule {}
