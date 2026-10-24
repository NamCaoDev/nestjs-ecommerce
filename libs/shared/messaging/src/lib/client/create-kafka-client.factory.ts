import { readEnv } from '@org/shared-infrastructure';
import { Kafka, logLevel } from 'kafkajs';
import { KafkaModuleOptions } from './kafka-module.options';
import { registerSnappyCodec } from './register-snappy-codec.util';

/** Brokers used when `KAFKA_BROKERS` is not set (docker-compose Redpanda). */
const DEFAULT_KAFKA_BROKERS = 'localhost:9092';

/**
 * Creates the Kafka client from `KAFKA_BROKERS` (comma-separated `host:port` list) with the Snappy
 * codec registered.
 *
 * @param options - Client identifier.
 * @returns A `kafkajs` client.
 */
export function createKafkaClient({ clientId }: KafkaModuleOptions): Kafka {
  registerSnappyCodec();
  return new Kafka({
    clientId,
    brokers: readEnv({
      name: 'KAFKA_BROKERS',
      defaultValue: DEFAULT_KAFKA_BROKERS,
    }).split(','),
    logLevel: logLevel.WARN,
  });
}
