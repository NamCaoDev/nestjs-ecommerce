import { ApiProperty } from '@nestjs/swagger';
import { WebhookAckResponse } from '../webhook-ack.response';

/**
 * OpenAPI schema of {@link WebhookAckResponse}.
 */
export class WebhookAckDoc implements WebhookAckResponse {
  @ApiProperty({ enum: [true], example: true })
  public readonly received!: true;
}
