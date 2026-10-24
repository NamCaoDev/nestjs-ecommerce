import { MissingEnvironmentVariableError } from '@org/shared-infrastructure';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalDatabaseUrl: string | undefined = process.env['DATABASE_URL'];
  afterEach(() => {
    process.env['DATABASE_URL'] = originalDatabaseUrl;
  });
  describe('constructor', () => {
    it('should fail fast when DATABASE_URL is missing', () => {
      // Arrange
      delete process.env['DATABASE_URL'];
      // Act
      const actualConstruction = (): PrismaService => new PrismaService();
      // Assert
      expect(actualConstruction).toThrow(MissingEnvironmentVariableError);
    });
    it('should expose the generated client with the order_db delegates', () => {
      // Arrange
      process.env['DATABASE_URL'] =
        'postgresql://user:password@localhost:5433/order_db';
      // Act
      const actualService: PrismaService = new PrismaService();
      // Assert
      expect(typeof actualService.client.order.create).toBe('function');
      expect(typeof actualService.client.outboxEvent.findMany).toBe('function');
      expect(typeof actualService.onModuleInit).toBe('function');
    });
  });
});
