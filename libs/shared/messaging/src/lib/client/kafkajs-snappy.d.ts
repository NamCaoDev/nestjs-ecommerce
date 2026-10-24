/**
 * Type declaration for `kafkajs-snappy`, which ships none: a factory returning a kafkajs codec.
 */
declare module 'kafkajs-snappy' {
  /** Snappy codec in the shape kafkajs expects. */
  interface SnappyCodec {
    compress(encoder: { readonly buffer: Buffer }): Promise<Buffer>;
    decompress(buffer: Buffer): Promise<Buffer>;
  }

  /** Creates the Snappy compression codec. */
  const createSnappyCodec: () => SnappyCodec;
  export = createSnappyCodec;
}
