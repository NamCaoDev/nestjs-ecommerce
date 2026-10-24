import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OpenAPI schema of error responses: domain errors carry a stable `code`; validation errors list
 * every violated rule in `message`.
 */
export class ErrorResponseDoc {
  @ApiProperty({ example: 401 })
  public readonly statusCode!: number;

  @ApiPropertyOptional({
    description: 'Stable domain error code (domain errors only).',
    example: 'PAYMENT.INVALID_WEBHOOK_SIGNATURE',
  })
  public readonly code?: string;

  @ApiProperty({
    description: 'Human-readable reason, or the list of validation failures.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Webhook signature is missing or does not match the payload.',
  })
  public readonly message!: string | string[];

  @ApiPropertyOptional({ example: 'Bad Request' })
  public readonly error?: string;
}
