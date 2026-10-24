import { Controller, Get } from '@nestjs/common';
import type { SmokeTestResponse } from './smoke-test.response';

/** Name reported by the smoke-test endpoint. */
const SERVICE_NAME = 'order-service';

/**
 * Temporary smoke-test endpoint confirming the service is up (CLAUDE.md §3: `admin/test`).
 */
@Controller('admin')
export class SmokeTestController {
  /**
   * @returns Liveness information for the order service.
   */
  @Get('test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }
}
