/**
 * Public API of the shared infrastructure library: environment, Redis and Prisma/PostgreSQL helpers
 * used by every service.
 */
export * from './lib/env/read-env.input';
export * from './lib/env/missing-environment-variable.error';
export * from './lib/env/read-env.util';
export * from './lib/env/read-boolean-env.input';
export * from './lib/env/invalid-environment-variable.error';
export * from './lib/env/read-boolean-env.util';
export * from './lib/bootstrap/emit-nx-ready-signal.util';
export * from './lib/redis/redis.service';
export * from './lib/redis/redis.module';
export * from './lib/persistence/create-pg-driver-adapter.factory';
export * from './lib/persistence/prisma-client-like.interface';
export * from './lib/persistence/abstract-prisma-service.props';
export * from './lib/persistence/database-connection.error';
export * from './lib/persistence/abstract-prisma.service';
export * from './lib/persistence/unique-constraint-violation.input';
export * from './lib/persistence/is-unique-constraint-violation.util';
export * from './lib/swagger/setup-swagger.input';
export * from './lib/swagger/setup-swagger.util';
