import {
  createPgDriverAdapter,
  readEnv,
  RedisService,
} from '@org/shared-infrastructure';
import { InventoryStock } from '../src/domain/aggregates/inventory-stock.aggregate';
import { PrismaClient } from '../src/infrastructure/persistence/prisma/generated/client';
import { InventoryRedisKeys } from '../src/infrastructure/redis/inventory-redis-keys';

/** Test SKU "sku-test-101"; a UUID because SKUs are logical UUIDs across services (CLAUDE.md §4.4). */
const DEFAULT_SEED_SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

/** Units stocked for the test SKU. */
const DEFAULT_SEED_QUANTITY = '100';

/**
 * Seeds one SKU into PostgreSQL and Redis with nothing reserved, overwriting any previous level.
 * Run with `npx nx run inventory-service:seed-stock` (reads `apps/inventory-service/.env`);
 * override with `SEED_SKU_ID` and `SEED_QUANTITY`.
 */
async function executeSeed(): Promise<void> {
  const stock: InventoryStock = InventoryStock.create({
    skuId: readEnv({ name: 'SEED_SKU_ID', defaultValue: DEFAULT_SEED_SKU_ID }),
    totalQuantity: Number(
      readEnv({ name: 'SEED_QUANTITY', defaultValue: DEFAULT_SEED_QUANTITY }),
    ),
  }).getValue();
  const prisma: PrismaClient = new PrismaClient({
    adapter: createPgDriverAdapter(readEnv({ name: 'DATABASE_URL' })),
  });
  const redis: RedisService = new RedisService();
  try {
    await saveStock({ stock, prisma, redis });
    console.log(
      `Seeded SKU ${stock.skuId}: total=${stock.totalQuantity} reserved=0 (PostgreSQL + Redis)`,
    );
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

/**
 * Writes the stock level to both stores.
 */
async function saveStock({
  stock,
  prisma,
  redis,
}: {
  readonly stock: InventoryStock;
  readonly prisma: PrismaClient;
  readonly redis: RedisService;
}): Promise<void> {
  const level: { totalQuantity: number; reservedQuantity: number } = {
    totalQuantity: stock.totalQuantity,
    reservedQuantity: stock.reservedQuantity,
  };
  await prisma.inventoryStock.upsert({
    where: { skuId: stock.skuId },
    create: { skuId: stock.skuId, ...level },
    update: { ...level, version: { increment: 1 } },
  });
  await redis.hset(InventoryRedisKeys.toStockKey(stock.skuId), {
    total: stock.totalQuantity,
    reserved: stock.reservedQuantity,
  });
}

executeSeed().catch((err: unknown): void => {
  console.error(err);
  process.exitCode = 1;
});
