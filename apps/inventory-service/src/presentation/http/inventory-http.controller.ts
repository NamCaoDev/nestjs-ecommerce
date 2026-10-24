import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RestockSkuCommand } from '../../application/commands/restock-sku/restock-sku.command';
import { DuplicateRequestError } from '../../application/errors/duplicate-request.error';
import { GetStockBySkuQuery } from '../../application/queries/get-stock-by-sku/get-stock-by-sku.query';
import { GetStockLedgerQuery } from '../../application/queries/get-stock-ledger/get-stock-ledger.query';
import type { StockLedgerEntryReadModel } from '../../application/read-models/stock-ledger-entry.read-model';
import type { StockLevelReadModel } from '../../application/read-models/stock-level.read-model';
import { IdempotencyKeyHeader } from './decorators/idempotency-key-header.decorator';
import { ErrorResponseDoc } from './docs/error-response.doc';
import { SmokeTestResponseDoc } from './docs/smoke-test-response.doc';
import { StockLedgerEntryDoc } from './docs/stock-ledger-entry.doc';
import { StockLevelDoc } from './docs/stock-level.doc';
import { RestockSkuDto } from './dto/restock-sku.dto';
import { IdempotencyKeyPipe } from './pipes/idempotency-key.pipe';
import type { SmokeTestResponse } from './smoke-test.response';

/** Name reported by the smoke-test endpoint. */
const SERVICE_NAME = 'inventory-service';

/**
 * REST read endpoints of the inventory (query side).
 */
@ApiTags('inventory')
@Controller('inventory')
export class InventoryHttpController {
  /**
   * @param queryBus - CQRS query bus.
   * @param commandBus - CQRS command bus.
   */
  public constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  /**
   * Records goods received for a SKU (creates the SKU when new).
   *
   * @param idempotencyKey - Required `Idempotency-Key` header.
   * @param dto - Validated receipt.
   * @returns The stock level after the receipt (HTTP 201).
   */
  @ApiOperation({
    summary: 'Restock a SKU (goods received)',
    description:
      'Raises the total in PostgreSQL with a RESTOCK ledger entry, then in Redis. Applied once per Idempotency-Key.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per receipt (max 128 characters).',
  })
  @ApiCreatedResponse({ type: StockLevelDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'Missing header or invalid body.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDoc,
    description: 'Idempotency-Key already applied.',
  })
  @Post('stocks/restock')
  public async restock(
    @IdempotencyKeyHeader(IdempotencyKeyPipe) idempotencyKey: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: RestockSkuDto,
  ): Promise<StockLevelReadModel> {
    const result: Result<StockLevelReadModel, DomainError> =
      await this.commandBus.execute(
        new RestockSkuCommand({
          skuId: dto.skuId,
          additionalQuantity: dto.quantity,
          referenceNote: dto.note,
          idempotencyKey,
        }),
      );
    if (result.isFailure) {
      throw InventoryHttpController.toHttpException(result.getError());
    }
    return result.getValue();
  }

  /**
   * @param skuId - SKU UUID.
   * @returns Total, reserved and available stock (HTTP 404 for an unknown SKU, 400 when not a UUID).
   */
  @ApiOperation({
    summary: 'Get the stock of a SKU',
    description:
      'Reads the Redis hot path; when Redis has no entry, reads PostgreSQL and restores Redis.',
  })
  @ApiOkResponse({ type: StockLevelDoc })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'The skuId is not a UUID.',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDoc, description: 'Unknown SKU.' })
  @Get('stocks/:skuId')
  public async getStock(
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<StockLevelReadModel> {
    const stock: StockLevelReadModel | undefined = await this.queryBus.execute(
      new GetStockBySkuQuery({ skuId }),
    );
    if (stock === undefined) {
      throw new NotFoundException(`SKU ${skuId} is not stocked.`);
    }
    return stock;
  }

  /**
   * @param skuId - SKU UUID.
   * @returns The 50 most recent ledger entries, newest first.
   */
  @ApiOperation({ summary: 'Get the 50 most recent stock movements of a SKU' })
  @ApiOkResponse({ type: [StockLedgerEntryDoc] })
  @ApiBadRequestResponse({
    type: ErrorResponseDoc,
    description: 'The skuId is not a UUID.',
  })
  @Get('stocks/:skuId/ledger')
  public getLedger(
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<StockLedgerEntryReadModel[]> {
    return this.queryBus.execute(new GetStockLedgerQuery({ skuId }));
  }

  /**
   * Smoke test of the inventory controller (CLAUDE.md §3: `admin/test`).
   *
   * @returns Liveness information.
   */
  @ApiOperation({ summary: 'Smoke test of the inventory controller' })
  @ApiOkResponse({ type: SmokeTestResponseDoc })
  @Get('admin/test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }

  /**
   * @returns 409 for a reused Idempotency-Key, 400 for any other business rule violation.
   */
  private static toHttpException(error: DomainError): HttpException {
    const body: { statusCode?: number; code: string; message: string } = {
      code: error.code,
      message: error.message,
    };
    if (error instanceof DuplicateRequestError) {
      return new ConflictException(body);
    }
    return new BadRequestException(body);
  }
}
