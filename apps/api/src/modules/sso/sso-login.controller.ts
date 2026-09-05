import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { loadEnv } from '@verifynng/config';
import { SsoLoginService, SsoError } from './sso-login.service';

@Controller('auth/sso')
export class SsoLoginController {
  private readonly appBaseUrl: string;

  constructor(private readonly ssoLogin: SsoLoginService) {
    this.appBaseUrl = loadEnv().APP_BASE_URL;
  }

  @Public()
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const callbackUrl = new URL(req.originalUrl, loadEnv().SSO_CALLBACK_URL);
    try {
      const { redirectUrl } = await this.ssoLogin.handleCallback(
        callbackUrl,
        req.ip,
      );
      res.redirect(302, redirectUrl);
    } catch (err) {
      res.redirect(302, this.errorUrl(err));
    }
  }

  @Public()
  @Get(':tenantSlug/start')
  async start(
    @Param('tenantSlug') tenantSlug: string,
    @Query('redirectTo') redirectTo: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const authUrl = await this.ssoLogin.startLogin(tenantSlug, redirectTo);
      res.redirect(302, authUrl);
    } catch (err) {
      res.redirect(302, this.errorUrl(err, tenantSlug));
    }
  }

  @Public()
  @Get(':tenantSlug')
  async status(@Param('tenantSlug') tenantSlug: string) {
    return this.ssoLogin.getPublicStatus(tenantSlug);
  }

  /** Exchanges the one-time code from the `/sso/complete` redirect for real
   * tokens — web-admin's `/sso/complete` route calls this, then sets the
   * refresh cookie itself, matching how `/auth/login` is handled (the API
   * never sets cookies directly; see the routing-convention note in
   * E20-sso.md's T1 checklist). */
  @Public()
  @Post('complete')
  async complete(@Body('code') code: string) {
    const login = await this.ssoLogin.completeExchange(code);
    if (!login) throw new NotFoundException('Code expired or already used');
    return login;
  }

  private errorUrl(err: unknown, tenantSlug?: string): string {
    const code = err instanceof SsoError ? err.code : 'idp_unreachable';
    const url = new URL('/sso/error', this.appBaseUrl);
    url.searchParams.set('code', code);
    if (tenantSlug) url.searchParams.set('tenant', tenantSlug);
    return url.href;
  }
}
