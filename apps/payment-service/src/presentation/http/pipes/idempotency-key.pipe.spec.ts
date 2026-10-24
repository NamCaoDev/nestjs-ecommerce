import { BadRequestException } from '@nestjs/common';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';

describe('IdempotencyKeyPipe', () => {
  const pipe: IdempotencyKeyPipe = new IdempotencyKeyPipe();
  it('should return the trimmed key', () => {
    // Arrange
    // Act
    const actualKey: string = pipe.transform('  refund-1 ');
    // Assert
    expect(actualKey).toBe('refund-1');
  });
  it.each([undefined, ' ', 'k'.repeat(81)])(
    'should refuse %p',
    (inputValue: string | undefined) => {
      // Arrange
      // Act
      const actualTransform: () => string = () => pipe.transform(inputValue);
      // Assert
      expect(actualTransform).toThrow(BadRequestException);
    },
  );
});
