import { Redis } from 'ioredis';
import { Pool } from 'pg';

/**
 * Direct connections to the stores behind the checkout flow, for arranging and asserting
 * acceptance tests. Defaults match docker-compose and the services' `.env.example`.
 */
export class CheckoutInfrastructure {
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

  /**
   * Closes every connection.
   */
  public async executeClose(): Promise<void> {
    await this.redis.quit();
    await this.orderDb.end();
    await this.inventoryDb.end();
  }
}
