import { InvalidEnvironmentVariableError } from './invalid-environment-variable.error';
import { readBooleanEnv } from './read-boolean-env.util';

const FLAG = 'SHARED_INFRASTRUCTURE_TEST_FLAG';

describe('readBooleanEnv', () => {
  afterEach(() => {
    delete process.env[FLAG];
  });
  it.each([
    { inputValue: 'true', expectedValue: true },
    { inputValue: 'TRUE', expectedValue: true },
    { inputValue: '1', expectedValue: true },
    { inputValue: 'false', expectedValue: false },
    { inputValue: ' False ', expectedValue: false },
    { inputValue: '0', expectedValue: false },
  ])(
    'should read $inputValue as $expectedValue',
    ({ inputValue, expectedValue }) => {
      // Arrange
      process.env[FLAG] = inputValue;
      // Act
      const actualValue: boolean = readBooleanEnv({
        name: FLAG,
        defaultValue: !expectedValue,
      });
      // Assert
      expect(actualValue).toBe(expectedValue);
    },
  );
  it.each([true, false])(
    'should fall back to the default %p when unset',
    (inputDefault: boolean) => {
      // Arrange
      delete process.env[FLAG];
      // Act
      const actualValue: boolean = readBooleanEnv({
        name: FLAG,
        defaultValue: inputDefault,
      });
      // Assert
      expect(actualValue).toBe(inputDefault);
    },
  );
  it('should reject an unknown value instead of guessing', () => {
    // Arrange
    process.env[FLAG] = 'yes';
    // Act
    const actualRead = (): boolean =>
      readBooleanEnv({ name: FLAG, defaultValue: true });
    // Assert
    expect(actualRead).toThrow(InvalidEnvironmentVariableError);
    expect(actualRead).toThrow(`${FLAG} has invalid value "yes"`);
  });
});
