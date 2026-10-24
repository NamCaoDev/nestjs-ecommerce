import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import createSnappyCodec from 'kafkajs-snappy';
import { registerSnappyCodec } from './register-snappy-codec.util';

describe('registerSnappyCodec', () => {
  it('should register a working Snappy codec in kafkajs', async () => {
    // Arrange
    const inputBuffer: Buffer = Buffer.from('order.placed '.repeat(20));
    registerSnappyCodec();
    const codecFactory: typeof createSnappyCodec =
      CompressionCodecs[CompressionTypes.Snappy];
    // Act
    const actualCompressed: Buffer = await codecFactory().compress({
      buffer: inputBuffer,
    });
    const actualDecompressed: Buffer =
      await codecFactory().decompress(actualCompressed);
    // Assert
    expect(codecFactory).toBe(createSnappyCodec);
    expect(actualCompressed.length).toBeLessThan(inputBuffer.length);
    expect(actualDecompressed.equals(inputBuffer)).toBe(true);
  });
});
