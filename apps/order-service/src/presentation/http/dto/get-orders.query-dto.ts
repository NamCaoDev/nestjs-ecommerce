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
  @IsUUID()
  public readonly customerId!: string;

  /** 1-based page number. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public readonly page: number = 1;

  /** Orders per page. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  public readonly limit: number = DEFAULT_PAGE_SIZE;
}
