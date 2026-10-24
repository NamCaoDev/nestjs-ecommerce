import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SmokeTestResponseDoc } from './docs/smoke-test-response.doc';
import type { SmokeTestResponse } from './smoke-test.response';

/** Name reported by the smoke-test endpoint. */
const SERVICE_NAME = 'inventory-service';

/**
 * Temporary smoke-test endpoint confirming the inventory service is up (CLAUDE.md §3: `admin/test`).
 */
@ApiTags('health')
@Controller('admin')
export class SmokeTestController {
  /**
   * @returns Liveness information for the order service.
   */
  @ApiOperation({ summary: 'Service liveness' })
  @ApiOkResponse({ type: SmokeTestResponseDoc })
  @Get('test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }
}
