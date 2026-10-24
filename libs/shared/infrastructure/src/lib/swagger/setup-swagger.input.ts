import { INestApplication } from '@nestjs/common';

/**
 * Input of {@link setupSwagger}.
 */
export interface SetupSwaggerInput {
  readonly app: INestApplication;
  /** Document title, e.g. `Order Service API`. */
  readonly title: string;
  readonly description: string;
  readonly version: string;
  /** Global route prefix of the application, e.g. `api`. */
  readonly globalPrefix: string;
}
