import { Redis } from 'ioredis';
import { Pool } from 'pg';

/**
 * Direct connections to the stores of the three services, for arranging and asserting the saga.
 * Defaults match docker-compose and the services' `.env.example`.
 */
export class SagaInfrastructure {
  public readonly redis: Redis = new Redis(
    process.env['E2E_REDIS_URL'] ?? 'redis://:redis_password@localhost:6379',
  );
  public readonly orderDb: Pool = new Pool({
    connectionString:
      process.env['E2E_ORDER_DATABASE_URL'] ??
      'postgresql://order_db_user:service_password@localhost:5433/order_db',
  });
  public readonly inventoryDb: Pool = new Pool({
    connectionString:
      process.env['E2E_INVENTORY_DATABASE_URL'] ??
      'postgresql://inventory_db_user:service_password@localhost:5433/inventory_db',
  });
  public readonly paymentDb: Pool = new Pool({
    connectionString:
      process.env['E2E_PAYMENT_DATABASE_URL'] ??
      'postgresql://payment_db_user:service_password@localhost:5433/payment_db',
  });

  /**
   * Closes every connection.
   */
  public async executeClose(): Promise<void> {
    await this.redis.quit();
    await Promise.all([
      this.orderDb.end(),
      this.inventoryDb.end(),
      this.paymentDb.end(),
    ]);
  }
}
