import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import createSnappyCodec from 'kafkajs-snappy';

/**
 * Registers the Snappy codec in kafkajs (process-wide), so consumers can read Snappy batches
 * written by any producer and producers can send with `CompressionTypes.Snappy`.
 */
export function registerSnappyCodec(): void {
  CompressionCodecs[CompressionTypes.Snappy] = createSnappyCodec;
}
