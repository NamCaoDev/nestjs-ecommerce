import { CommandBus } from '@nestjs/cqrs';
import { RelayInventoryOutboxCommand } from '../../application/commands/relay-inventory-outbox/relay-inventory-outbox.command';
import { InventoryOutboxRelayService } from './inventory-outbox-relay.service';

describe('InventoryOutboxRelayService', () => {
  it('should relay a batch of 50 on each run', async () => {
    // Arrange
    const mockCommandBus: { readonly execute: jest.Mock } = {
      execute: jest.fn().mockResolvedValue({}),
    };
    const service: InventoryOutboxRelayService =
      new InventoryOutboxRelayService(mockCommandBus as unknown as CommandBus);
    // Act
    await service.executeRun();
    // Assert
    const actualCommand: RelayInventoryOutboxCommand =
      mockCommandBus.execute.mock.calls[0][0];
    expect(actualCommand).toBeInstanceOf(RelayInventoryOutboxCommand);
    expect(actualCommand.batchSize).toBe(50);
  });
});
