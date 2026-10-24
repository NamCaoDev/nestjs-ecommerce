import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OpenAPI schema of error responses: domain errors carry a stable `code`; validation errors list
 * every violated rule in `message`.
 */
export class ErrorResponseDoc {
  @ApiProperty({ example: 409 })
  public readonly statusCode!: number;

  @ApiPropertyOptional({
    description: 'Stable domain error code (domain errors only).',
    example: 'IDEMPOTENCY.DUPLICATE_REQUEST',
  })
  public readonly code?: string;

  @ApiProperty({
    description: 'Human-readable reason, or the list of validation failures.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Request with Idempotency-Key checkout-42 was already received.',
  })
  public readonly message!: string | string[];

  @ApiPropertyOptional({ example: 'Bad Request' })
  public readonly error?: string;
}
