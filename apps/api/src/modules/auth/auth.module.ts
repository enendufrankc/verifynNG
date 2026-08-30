import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { MfaService } from './services/mfa.service';
import { ApiClientService } from './services/api-client.service';
import { InternalController } from './controllers/internal.controller';
import { SmtpMailer } from './mailer/smtp-mailer.service';
import { MAILER } from './mailer/mailer.interface';
import { PrismaClient } from '@prisma/client';

@Module({
  // Not EventEmitterModule.forRoot() here — it must be called exactly once
  // app-wide (common/events.module.ts does it); a second call gives NestJS's
  // DI a second, disconnected EventEmitter2 instance, so anything emitted
  // through one is invisible to listeners bound to the other. See E12's
  // note on this in app.module.ts.
  imports: [JwtModule.register({})],
  controllers: [AuthController, InternalController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    MfaService,
    ApiClientService,
    PrismaClient,
    { provide: MAILER, useClass: SmtpMailer },
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    MfaService,
    ApiClientService,
  ],
})
export class AuthModule implements OnModuleInit {
  constructor(private apiClientService: ApiClientService) {}

  async onModuleInit() {
    await this.apiClientService.seedInternalClients();
  }
}
