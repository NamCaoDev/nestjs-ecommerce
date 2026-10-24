/**
 * Raised at startup when an environment variable holds a value that cannot be interpreted.
 */
export class InvalidEnvironmentVariableError extends Error {
  /**
   * @param input - Variable name, rejected value and the accepted values.
   */
  public constructor({
    name,
    value,
    expected,
  }: {
    readonly name: string;
    readonly value: string;
    readonly expected: string;
  }) {
    super(
      `Environment variable ${name} has invalid value "${value}"; expected ${expected}.`,
    );
    this.name = InvalidEnvironmentVariableError.name;
  }
}
