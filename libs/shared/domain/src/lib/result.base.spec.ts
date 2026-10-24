import { DomainError } from './domain-error.base';
import { Result } from './result.base';

describe('Result', () => {
  describe('ok', () => {
    it('should create a successful result holding the value', () => {
      // Arrange
      const expectedValue: number = 42;
      // Act
      const actualResult: Result<number> = Result.ok(expectedValue);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(actualResult.isFailure).toBe(false);
      expect(actualResult.getValue()).toBe(expectedValue);
    });
    it('should throw when reading the error of a success', () => {
      // Arrange
      const inputResult: Result<number> = Result.ok(42);
      // Act
      const actualRead = (): Error => inputResult.getError();
      // Assert
      expect(actualRead).toThrow(
        'Cannot read the error of a successful Result',
      );
    });
    it('should create a successful void result when called without a value', () => {
      // Arrange
      const expectedValue: undefined = undefined;
      // Act
      const actualResult: Result<void, never> = Result.ok();
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(actualResult.getValue()).toBe(expectedValue);
    });
    it('should be assignable to a void result with a domain error type', () => {
      // Arrange
      const executeCommand = (): Result<void, DomainError> => Result.ok();
      // Act
      const actualResult: Result<void, DomainError> = executeCommand();
      // Assert
      expect(actualResult.isSuccess).toBe(true);
    });
  });
  describe('fail', () => {
    it('should create a failed result holding the error', () => {
      // Arrange
      const expectedError: Error = new Error('Insufficient stock');
      // Act
      const actualResult: Result<number> = Result.fail(expectedError);
      // Assert
      expect(actualResult.isSuccess).toBe(false);
      expect(actualResult.isFailure).toBe(true);
      expect(actualResult.getError()).toBe(expectedError);
    });
    it('should support a custom error type', () => {
      // Arrange
      const expectedError: string = 'OUT_OF_STOCK';
      // Act
      const actualResult: Result<number, string> = Result.fail<number, string>(
        expectedError,
      );
      // Assert
      expect(actualResult.getError()).toBe(expectedError);
    });
    it('should throw when reading the value of a failure', () => {
      // Arrange
      const inputResult: Result<number> = Result.fail(new Error('boom'));
      // Act
      const actualRead = (): number => inputResult.getValue();
      // Assert
      expect(actualRead).toThrow('Cannot read the value of a failed Result');
    });
  });
  describe('immutability', () => {
    it('should be frozen', () => {
      // Arrange
      const inputResult: Result<number> = Result.ok(1);
      // Act
      const actualIsFrozen: boolean = Object.isFrozen(inputResult);
      // Assert
      expect(actualIsFrozen).toBe(true);
    });
  });
});
