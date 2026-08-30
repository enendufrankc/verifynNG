import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { QuotaService } from '../quota/quota.service';
import { OemScopeGuard } from './guards/oem-scope.guard';
import { OemCtx } from './decorators/oem-context.decorator';
import type { OemContext } from './guards/oem-scope.guard';
import { DeliveryService } from './delivery.service';
import { ReceiptService } from './receipt.service';
import { ShipmentService } from './shipment.service';
import { SubmitReceiptDto } from './dto/submit-receipt.dto';
import { ShipBatchDto } from './dto/ship-batch.dto';

/** The OEM (factory) portal — role `oem`, scoped to the caller's own OEM. */
@Controller('v1/oem/deliveries')
@Roles('oem')
@UseGuards(OemScopeGuard)
export class OemPortalController {
  constructor(
    private deliveryService: DeliveryService,
    private receiptService: ReceiptService,
    private shipmentService: ShipmentService,
    private auditService: AuditService,
    private quotaService: QuotaService,
  ) {}

  @Get()
  list(@OemCtx() oem: OemContext) {
    return this.deliveryService.listForOem(oem.oemId, oem.tenantId);
  }

  @Get(':id')
  get(@Param('id') id: string, @OemCtx() oem: OemContext) {
    return this.deliveryService.getForOem(id, oem.oemId, oem.tenantId);
  }

  @Get(':id/manifest')
  async manifest(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @OemCtx() oem: OemContext,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.deliveryService.assertOemAccess(id, oem.oemId, oem.tenantId);
    if (!token) throw new BadRequestException('missing_token');

    await this.quotaService.assertWithinQuota(
      oem.tenantId,
      'manifest_downloads_per_hour',
      { key: oem.oemId },
    );

    const result = await this.deliveryService.openForDownload(id, token);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const { downloadCount } = await this.deliveryService.recordDownload(
      id,
      oem.oemUserId,
      req.ip ?? 'unknown',
      req.headers['user-agent'],
    );
    await this.auditService.record({
      tenantId: oem.tenantId,
      actor: { type: 'oem', id: oem.oemUserId, ip: req.ip },
      action: 'manifest.download',
      target: { type: 'delivery', id },
      payload: { downloadCount },
    });

    res.type('application/json').send(result.json);
  }

  @Get(':id/artwork')
  async artwork(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @OemCtx() oem: OemContext,
    @Res() res: Response,
  ) {
    const delivery = await this.deliveryService.assertOemAccess(
      id,
      oem.oemId,
      oem.tenantId,
    );
    if (!token) throw new BadRequestException('missing_token');

    const check = await this.deliveryService.checkArtworkToken(id, token);
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { url } = await this.deliveryService.getArtworkRedirectUrl(delivery);
    res.redirect(302, url);
  }

  @Post(':id/receipt')
  receipt(
    @Param('id') id: string,
    @Body() dto: SubmitReceiptDto,
    @OemCtx() oem: OemContext,
  ) {
    return this.receiptService.verify(id, dto, oem);
  }

  @Post(':id/ship')
  ship(
    @Param('id') id: string,
    @Body() dto: ShipBatchDto,
    @OemCtx() oem: OemContext,
  ) {
    return this.shipmentService.ship(id, dto, oem);
  }
}
