import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Request header carrying the client Idempotency-Key. */
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Injects the raw `Idempotency-Key` header. Unlike `@Headers()`, it accepts pipes,
 * e.g. `@IdempotencyKeyHeader(IdempotencyKeyPipe)`.
 */
export const IdempotencyKeyHeader: (
  ...dataOrPipes: unknown[]
) => ParameterDecorator = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    ctx.switchToHttp().getRequest<Request>().header(IDEMPOTENCY_KEY_HEADER),
);
