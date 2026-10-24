import { TEST_IDS } from '../../../testing/test-ids';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogPrismaRepository } from './audit-log.prisma.repository';

describe('AuditLogPrismaRepository', () => {
  it('should append one row with SQL NULL for absent fields', async () => {
    // Arrange
    const mockCreate: jest.Mock = jest.fn().mockResolvedValue(undefined);
    const repository: AuditLogPrismaRepository = new AuditLogPrismaRepository({
      client: { paymentAuditLog: { create: mockCreate } },
    } as unknown as PrismaService);
    // Act
    await repository.append({
      paymentId: TEST_IDS.PAYMENT,
      action: 'WEBHOOK_SIGNATURE_MISMATCH',
      actorType: 'GATEWAY',
      actorId: 'MOCK',
      ipAddress: '203.0.113.7',
      occurredAt: 5_000,
    });
    // Assert
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: TEST_IDS.PAYMENT,
        transactionId: null,
        action: 'WEBHOOK_SIGNATURE_MISMATCH',
        actorType: 'GATEWAY',
        actorId: 'MOCK',
        stateFrom: null,
        ipAddress: '203.0.113.7',
        createdAt: new Date(5_000),
      }),
    });
  });
});
