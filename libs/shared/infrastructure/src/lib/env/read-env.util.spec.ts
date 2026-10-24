import { MissingEnvironmentVariableError } from './missing-environment-variable.error';
import { readEnv } from './read-env.util';

const VARIABLE = 'SHARED_INFRASTRUCTURE_TEST_VARIABLE';

describe('readEnv', () => {
  afterEach(() => {
    delete process.env[VARIABLE];
  });
  it('should return the configured value', () => {
    // Arrange
    process.env[VARIABLE] = 'configured';
    // Act
    const actualValue: string = readEnv({
      name: VARIABLE,
      defaultValue: 'fallback',
    });
    // Assert
    expect(actualValue).toBe('configured');
  });
  it.each([undefined, ''])(
    'should fall back to the default when the value is %p',
    (inputValue: string | undefined) => {
      // Arrange
      if (inputValue !== undefined) {
        process.env[VARIABLE] = inputValue;
      }
      // Act
      const actualValue: string = readEnv({
        name: VARIABLE,
        defaultValue: 'fallback',
      });
      // Assert
      expect(actualValue).toBe('fallback');
    },
  );
  it('should throw a clear error when a required variable is missing', () => {
    // Arrange
    const expectedMessage: string = `Required environment variable ${VARIABLE} is not set`;
    // Act
    const actualRead = (): string => readEnv({ name: VARIABLE });
    // Assert
    expect(actualRead).toThrow(MissingEnvironmentVariableError);
    expect(actualRead).toThrow(expectedMessage);
  });
});
