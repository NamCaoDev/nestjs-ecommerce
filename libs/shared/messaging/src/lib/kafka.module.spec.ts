import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { KAFKA_CLIENT } from './client/kafka-client.token';
import { KafkaModule } from './kafka.module';
import { KafkaProducerService } from './producer/kafka-producer.service';
import { KafkaTopicManager } from './topics/kafka-topic.manager';

describe('KafkaModule', () => {
  describe('register', () => {
    it('should provide and export the client, topic manager and producer', () => {
      // Arrange
      const expectedExports: unknown[] = [
        KAFKA_CLIENT,
        KafkaTopicManager,
        KafkaProducerService,
      ];
      // Act
      const actualModule: DynamicModule = KafkaModule.register({
        clientId: 'test-service',
      });
      // Assert
      expect(actualModule.exports).toEqual(expectedExports);
      const actualClientProvider: FactoryProvider = actualModule
        .providers?.[0] as FactoryProvider;
      expect(actualClientProvider.provide).toBe(KAFKA_CLIENT);
      expect(actualClientProvider.useFactory()).toBeInstanceOf(Kafka);
    });
  });
});
