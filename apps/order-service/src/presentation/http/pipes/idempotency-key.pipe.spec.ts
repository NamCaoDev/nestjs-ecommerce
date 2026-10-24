import { BadRequestException } from '@nestjs/common';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';

describe('IdempotencyKeyPipe', () => {
  const pipe: IdempotencyKeyPipe = new IdempotencyKeyPipe();
  describe('transform', () => {
    it('should return the trimmed key', () => {
      // Arrange
      const inputValue: string = '  checkout-42 ';
      // Act
      const actualKey: string = pipe.transform(inputValue);
      // Assert
      expect(actualKey).toBe('checkout-42');
    });
    it.each([undefined, '', '   ', 'k'.repeat(129)])(
      'should reject %p with 400',
      (inputValue: string | undefined) => {
        // Arrange
        const expectedErrorType: typeof BadRequestException =
          BadRequestException;
        // Act
        const actualTransform = (): string => pipe.transform(inputValue);
        // Assert
        expect(actualTransform).toThrow(expectedErrorType);
      },
    );
  });
});
