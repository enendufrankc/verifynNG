import {
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../../../common/tenant';
import { getClientIp, hashIp } from '../../../common/ip-utils';
import { QuotaService } from '../../quota/quota.service.js';
import { CAPTCHA_PORT } from '../../reports/captcha/captcha-port';
import type { CaptchaPort } from '../../reports/captcha/captcha-port';
import { PublicSupportDto } from './dto/public-support.dto';
import { TicketsService } from './tickets.service';

@Controller('v1/public/support')
@Public()
export class TicketsPublicController {
  constructor(
    private readonly config: ConfigService,
    private readonly tickets: TicketsService,
    private readonly quota: QuotaService,
    @Inject(CAPTCHA_PORT) private readonly captcha: CaptchaPort,
  ) {}

  @Post()
  async submit(@Body() dto: PublicSupportDto, @Req() req: Request) {
    const trustProxy = this.config.get<boolean>('TRUST_PROXY', true);
    const ip =
      getClientIp(
        req.headers as Record<string, unknown>,
        req.socket.remoteAddress,
        trustProxy,
      ) ?? '0.0.0.0';
    const salt = this.config.get<string>('IP_HASH_SALT')!;
    const ipHash = hashIp(ip, salt);

    const captchaResult = await this.captcha.verify(dto.captchaToken, ip);
    if (!captchaResult.ok) {
      throw new ForbiddenException({
        error: 'captcha_failed',
        reason: captchaResult.reason,
      });
    }

    // Platform-wide (no tenantId yet — the code, if any, is only resolved
    // to a tenant inside the service) — quota is keyed by IP hash alone.
    await this.quota.assertWithinQuota(
      'platform',
      'support_public_form_per_ip_per_hour',
      { key: ipHash },
    );

    const ticket = await this.tickets.createFromPublicForm({
      email: dto.email,
      subject: dto.subject,
      body: dto.body,
      code: dto.code,
    });
    return { ticketNumber: ticket.number };
  }
}
