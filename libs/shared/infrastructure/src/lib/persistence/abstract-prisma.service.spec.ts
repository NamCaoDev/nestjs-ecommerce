import { PrismaPg } from '@prisma/adapter-pg';
import { MissingEnvironmentVariableError } from '../env/missing-environment-variable.error';
import { AbstractPrismaService } from './abstract-prisma.service';
import { DatabaseConnectionError } from './database-connection.error';
import { PrismaClientLike } from './prisma-client-like.interface';

/** Fake generated client recording its adapter. */
interface MockPrismaClient extends PrismaClientLike {
  readonly adapter: PrismaPg;
  readonly $connect: jest.Mock;
  readonly $disconnect: jest.Mock;
  readonly $executeRawUnsafe: jest.Mock;
}

/**
 * Concrete service as an application would declare it.
 */
class TestPrismaService extends AbstractPrismaService<MockPrismaClient> {
  public constructor() {
    super({
      serviceName: 'test-service',
      createClient: (adapter: PrismaPg): MockPrismaClient => ({
        adapter,
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      }),
    });
  }
}

describe('AbstractPrismaService', () => {
  const originalDatabaseUrl: string | undefined = process.env['DATABASE_URL'];
  beforeEach(() => {
    process.env['DATABASE_URL'] =
      'postgresql://user:password@localhost:5433/test_db';
  });
  afterEach(() => {
    process.env['DATABASE_URL'] = originalDatabaseUrl;
  });
  it('should build the client on the pg driver adapter', () => {
    // Arrange
    const expectedAdapterType: typeof PrismaPg = PrismaPg;
    // Act
    const actualService: TestPrismaService = new TestPrismaService();
    // Assert
    expect(actualService.client.adapter).toBeInstanceOf(expectedAdapterType);
  });
  it('should fail fast when DATABASE_URL is missing', () => {
    // Arrange
    delete process.env['DATABASE_URL'];
    // Act
    const actualConstruction = (): TestPrismaService => new TestPrismaService();
    // Assert
    expect(actualConstruction).toThrow(MissingEnvironmentVariableError);
  });
  describe('onModuleInit', () => {
    it('should connect and probe the database', async () => {
      // Arrange
      const service: TestPrismaService = new TestPrismaService();
      // Act
      await service.onModuleInit();
      // Assert
      expect(service.client.$connect).toHaveBeenCalledTimes(1);
      expect(service.client.$executeRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    });
    it('should wrap an unreachable database in a DatabaseConnectionError', async () => {
      // Arrange
      const service: TestPrismaService = new TestPrismaService();
      service.client.$executeRawUnsafe.mockRejectedValue(
        new Error('ECONNREFUSED'),
      );
      // Act
      const actualInit: Promise<void> = service.onModuleInit();
      // Assert
      await expect(actualInit).rejects.toThrow(DatabaseConnectionError);
      await expect(service.onModuleInit()).rejects.toThrow(
        'test-service cannot reach its database: ECONNREFUSED',
      );
    });
  });
  describe('onModuleDestroy', () => {
    it('should disconnect, releasing the pool', async () => {
      // Arrange
      const service: TestPrismaService = new TestPrismaService();
      // Act
      await service.onModuleDestroy();
      // Assert
      expect(service.client.$disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
