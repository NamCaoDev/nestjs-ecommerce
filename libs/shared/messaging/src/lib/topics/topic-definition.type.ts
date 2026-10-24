/**
 * A topic and the partition count it must be created with.
 */
export interface TopicDefinition {
  readonly topic: string;
  readonly numPartitions: number;
}
