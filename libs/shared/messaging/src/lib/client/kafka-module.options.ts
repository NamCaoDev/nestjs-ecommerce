/**
 * Options of {@link KafkaModule.register}.
 */
export interface KafkaModuleOptions {
  /** Client identifier reported to the brokers, e.g. `order-service`. */
  readonly clientId: string;
}
