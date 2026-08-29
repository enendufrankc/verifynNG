import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { MfaChallengeDto } from './dto/mfa-challenge.dto';
import { MfaEnableDto } from './dto/mfa-enable.dto';
import { MfaDisableDto } from './dto/mfa-disable.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { Principal } from './decorators/principal.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Registration ─────────────────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.displayName);
  }

  // ── Login / Refresh / Logout ─────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.login(dto.email, dto.password, userAgent, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.refresh(dto.refreshToken, userAgent, ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshDto,
    @Principal() principal: any,
  ) {
    return this.authService.logout(principal?.userId, dto.refreshToken);
  }

  // ── Me / Switch Tenant ───────────────────────────────────

  @Get('me')
  async me(@Principal() principal: any) {
    return this.authService.me(principal.userId);
  }

  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  async switchTenant(
    @Body() dto: SwitchTenantDto,
    @Principal() principal: any,
  ) {
    return this.authService.switchTenant(
      principal.userId,
      dto.tenantId,
      principal.sessionId,
    );
  }

  // ── MFA ──────────────────────────────────────────────────

  @Post('mfa/setup')
  async mfaSetup(@Principal() principal: any) {
    return this.authService.mfaSetup(principal.userId);
  }

  @Post('mfa/enable')
  async mfaEnable(
    @Body() dto: MfaEnableDto,
    @Principal() principal: any,
  ) {
    return this.authService.mfaEnable(principal.userId, dto.code);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async mfaDisable(
    @Body() dto: MfaDisableDto,
    @Principal() principal: any,
  ) {
    return this.authService.mfaDisable(
      principal.userId,
      dto.password,
      dto.code,
    );
  }

  @Public()
  @Post('mfa/challenge')
  @HttpCode(HttpStatus.OK)
  async mfaChallenge(@Body() dto: MfaChallengeDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.connection?.remoteAddress;
    return this.authService.mfaChallenge(
      dto.mfaToken,
      dto.code,
      dto.recoveryCode,
      userAgent,
      ip,
    );
  }

  @Post('mfa/recovery-codes/rotate')
  async mfaRecoveryCodesRotate(
    @Body() dto: MfaEnableDto,
    @Principal() principal: any,
  ) {
    return this.authService.mfaRecoveryCodesRotate(principal.userId, dto.code);
  }

  // ── Password Reset / Change ──────────────────────────────

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Always 202 — no user enumeration
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Principal() principal: any,
  ) {
    await this.authService.changePassword(
      principal.userId,
      dto.currentPassword,
      dto.newPassword,
      principal.sessionId,
    );
  }

  // ── Sessions ─────────────────────────────────────────────

  @Get('sessions')
  async listSessions(@Principal() principal: any) {
    return this.authService.listSessions(
      principal.userId,
      principal.sessionId,
    );
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Principal() principal: any,
  ) {
    await this.authService.revokeSessionById(
      principal.userId,
      sessionId,
      principal.sessionId,
    );
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllOtherSessions(@Principal() principal: any) {
    await this.authService.revokeAllOtherSessions(
      principal.userId,
      principal.sessionId,
    );
  }
}
