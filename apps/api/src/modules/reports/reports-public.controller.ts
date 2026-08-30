import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/public.decorator';
import { getClientIp, hashIp } from '../../common/ip-utils';
import { QuotaService } from '../quota/quota.service.js';
import { ReportsService } from './reports.service';
import { PhotosService } from './photos.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import { SubmitReportDto } from './dto/submit-report.dto';
import type { CaptchaPort } from './captcha/captcha-port';
import { CAPTCHA_PORT } from './captcha/captcha-port';

@Controller('v1/public/:tenantSlug/reports')
@Public()
export class ReportsPublicController {
  constructor(
    private readonly config: ConfigService,
    private readonly reports: ReportsService,
    private readonly photos: PhotosService,
    private readonly quota: QuotaService,
    @Inject(CAPTCHA_PORT) private readonly captcha: CaptchaPort,
    @InjectQueue('reports') private readonly queue: Queue,
  ) {}

  private ipContext(req: Request) {
    const trustProxy = this.config.get<boolean>('TRUST_PROXY', true);
    const ip =
      getClientIp(
        req.headers as Record<string, unknown>,
        req.socket.remoteAddress,
        trustProxy,
      ) ?? '0.0.0.0';
    const salt = this.config.get<string>('IP_HASH_SALT')!;
    return { ip, ipHash: hashIp(ip, salt) };
  }

  @Post('upload-url')
  async requestUpload(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: RequestUploadDto,
    @Req() req: Request,
  ) {
    const tenant = await this.reports.resolveTenantBySlug(tenantSlug);
    const { ip, ipHash } = this.ipContext(req);

    const captchaResult = await this.captcha.verify(dto.captchaToken, ip);
    if (!captchaResult.ok) {
      throw new ForbiddenException({
        error: 'captcha_failed',
        reason: captchaResult.reason,
      });
    }
    await this.quota.assertWithinQuota(
      tenant.id,
      'report_uploads_per_ip_per_hour',
      { key: ipHash },
    );

    return this.photos.requestUpload(
      tenant.id,
      dto.contentType,
      dto.sizeBytes,
      ipHash,
    );
  }

  @Post()
  async submit(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: SubmitReportDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ) {
    const tenant = await this.reports.resolveTenantBySlug(tenantSlug);
    const { ip, ipHash } = this.ipContext(req);

    const captchaResult = await this.captcha.verify(dto.captchaToken, ip);
    if (!captchaResult.ok) {
      throw new ForbiddenException({
        error: 'captcha_failed',
        reason: captchaResult.reason,
      });
    }
    await this.quota.assertWithinQuota(tenant.id, 'reports_per_ip_per_hour', {
      key: ipHash,
    });

    const result = await this.reports.submit(tenantSlug, dto, {
      ip,
      ipHash,
      userAgent,
      locale: acceptLanguage?.split(',')[0],
      captchaVerified: true,
    });

    const photoIds = await this.reports.listPhotoIds(result.reportId);
    for (const photoId of photoIds) {
      await this.queue.add('photo.process', { photoId });
    }
    return { reference: result.reference, statusUrl: result.statusUrl };
  }

  @Get(':reference')
  async status(
    @Param('tenantSlug') tenantSlug: string,
    @Param('reference') reference: string,
  ) {
    return this.reports.getPublicStatus(tenantSlug, reference);
  }
}
