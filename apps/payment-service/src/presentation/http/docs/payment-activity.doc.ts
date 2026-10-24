import { ApiProperty } from '@nestjs/swagger';
import { PaymentActivityReadModel } from '../../../application/read-models/payment-activity.read-model';
import type { PaymentActorType } from '../../../domain/types/payment-actor-type.type';

/**
 * OpenAPI schema of {@link PaymentActivityReadModel}.
 */
export class PaymentActivityDoc implements PaymentActivityReadModel {
  @ApiProperty({ format: 'uuid' })
  public readonly activityId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly paymentId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  public readonly transactionId!: string | null;

  @ApiProperty({ example: 'STATE_CHANGED' })
  public readonly action!: string;

  @ApiProperty({ enum: ['SYSTEM', 'GATEWAY', 'CUSTOMER', 'ADMIN'] })
  public readonly actorType!: PaymentActorType;

  @ApiProperty({ type: String, nullable: true, example: 'MOCK' })
  public readonly actorId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'PENDING' })
  public readonly stateFrom!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'PAID' })
  public readonly stateTo!: string | null;

  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  public readonly payload!: Readonly<Record<string, unknown>> | null;

  @ApiProperty({ type: String, nullable: true })
  public readonly ipAddress!: string | null;

  @ApiProperty({ description: 'Epoch milliseconds.' })
  public readonly createdAt!: number;
}
