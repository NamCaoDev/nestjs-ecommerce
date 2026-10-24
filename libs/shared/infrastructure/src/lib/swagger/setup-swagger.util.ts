import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { readBooleanEnv } from '../env/read-boolean-env.util';
import { SetupSwaggerInput } from './setup-swagger.input';

/**
 * Serves the OpenAPI document of a service: Swagger UI at `/{prefix}/docs` and the JSON document at
 * `/{prefix}/docs-json`. Disabled with `SWAGGER_ENABLED=false` (e.g. on public production endpoints).
 *
 * @param input - Application, document metadata and global prefix.
 * @returns `true` when the documentation is served.
 */
export function setupSwagger({
  app,
  title,
  description,
  version,
  globalPrefix,
}: SetupSwaggerInput): boolean {
  if (!readBooleanEnv({ name: 'SWAGGER_ENABLED', defaultValue: true })) {
    return false;
  }
  const config: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion(version)
    .build();
  const document: OpenAPIObject = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document, {
    jsonDocumentUrl: `${globalPrefix}/docs-json`,
  });
  return true;
}
