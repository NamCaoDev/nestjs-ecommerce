import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';

/** Results the mock gateway can report. */
const FINAL_STATUSES: readonly FinalTransactionStatus[] = [
  'SUCCESS',
  'FAILED',
  'CANCELLED',
] as const;

/** Longest failure reason stored. */
const MAX_FAILURE_REASON_LENGTH = 500;

/**
 * Body of `POST /payments/mock-gateway/pay`: the result the customer gets at the mock checkout.
 */
export class MockGatewayPayDto {
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-000000000001',
  })
  @IsUUID()
  public readonly orderId!: string;

  @ApiProperty({ enum: FINAL_STATUSES, example: 'SUCCESS' })
  @IsIn(FINAL_STATUSES)
  public readonly status!: FinalTransactionStatus;

  @ApiPropertyOptional({
    maxLength: MAX_FAILURE_REASON_LENGTH,
    example: 'CARD_DECLINED',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FAILURE_REASON_LENGTH)
  public readonly failureReason?: string;
}
