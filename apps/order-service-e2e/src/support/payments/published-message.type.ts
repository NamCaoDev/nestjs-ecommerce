/**
 * Position of a message published by a test.
 */
export interface PublishedMessage {
  readonly partition: number;
  readonly offset: string;
}
