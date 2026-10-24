/**
 * Framework, infrastructure and reactive packages that must never leak into the Domain Layer.
 * The Domain Layer relies only on primitives, Promise and async/await. See `.claude/CLAUDE.md` §3.
 */
export default [
  '@nestjs/*',
  '@prisma/*',
  'prisma',
  'ioredis',
  'kafkajs',
  '@grpc/*',
  'express',
  'class-validator',
  'class-transformer',
  'rxjs',
  'rxjs/*',
];
