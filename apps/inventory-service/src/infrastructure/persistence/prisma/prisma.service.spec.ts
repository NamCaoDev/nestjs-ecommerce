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
    it('should expose the generated client with the inventory_db delegates', () => {
      // Arrange
      process.env['DATABASE_URL'] =
        'postgresql://user:password@localhost:5433/inventory_db';
      // Act
      const actualService: PrismaService = new PrismaService();
      // Assert
      expect(typeof actualService.client.inventoryStock.update).toBe(
        'function',
      );
      expect(typeof actualService.client.stockLedger.createMany).toBe(
        'function',
      );
      expect(typeof actualService.onModuleInit).toBe('function');
    });
  });
});
