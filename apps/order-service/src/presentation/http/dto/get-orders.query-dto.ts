import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/** Page size used when `limit` is omitted. */
const DEFAULT_PAGE_SIZE = 20;

/** Largest page size accepted. */
const MAX_PAGE_SIZE = 100;

/**
 * Query string of `GET /orders`.
 */
export class GetOrdersQueryDto {
  /** Customer whose orders are listed. */
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-0000000000c1',
  })
  @IsUUID()
  public readonly customerId!: string;

  /** 1-based page number. */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page: number = 1;

  /** Orders per page. */
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  public readonly limit: number = DEFAULT_PAGE_SIZE;
}
