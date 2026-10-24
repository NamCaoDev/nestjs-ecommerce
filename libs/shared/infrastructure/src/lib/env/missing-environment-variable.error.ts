/**
 * Raised at startup when a required environment variable is missing (misconfigured deployment).
 */
export class MissingEnvironmentVariableError extends Error {
  /**
   * @param name - Name of the missing variable.
   */
  public constructor(name: string) {
    super(
      `Required environment variable ${name} is not set. Define it in the service .env file or the deployment environment.`,
    );
    this.name = MissingEnvironmentVariableError.name;
  }
}
