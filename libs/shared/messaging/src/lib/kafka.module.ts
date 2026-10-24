import { DynamicModule, Module } from '@nestjs/common';
import { createKafkaClient } from './client/create-kafka-client.factory';
import { KAFKA_CLIENT } from './client/kafka-client.token';
import { KafkaModuleOptions } from './client/kafka-module.options';
import { KafkaProducerService } from './producer/kafka-producer.service';
import { KafkaTopicManager } from './topics/kafka-topic.manager';

/**
 * Provides the shared Kafka client ({@link KAFKA_CLIENT}), {@link KafkaTopicManager} and
 * {@link KafkaProducerService} for one service.
 */
@Module({})
export class KafkaModule {
  /**
   * @param options - Client identifier of the service.
   * @returns The configured module.
   */
  public static register(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      providers: [
        {
          provide: KAFKA_CLIENT,
          useFactory: (): ReturnType<typeof createKafkaClient> =>
            createKafkaClient(options),
        },
        KafkaTopicManager,
        KafkaProducerService,
      ],
      exports: [KAFKA_CLIENT, KafkaTopicManager, KafkaProducerService],
    };
  }
}
