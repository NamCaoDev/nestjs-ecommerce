import { ApiProperty } from '@nestjs/swagger';
import { SmokeTestResponse } from '../smoke-test.response';

/**
 * OpenAPI schema of {@link SmokeTestResponse}.
 */
export class SmokeTestResponseDoc implements SmokeTestResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  public readonly status!: 'ok';

  @ApiProperty({ example: 'order-service' })
  public readonly service!: string;

  @ApiProperty({ description: 'Epoch milliseconds.', example: 1792843950926 })
  public readonly timestamp!: number;
}
