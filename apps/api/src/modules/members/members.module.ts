import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembershipService } from './members.service';
import { PrismaClient } from '@prisma/client';
import { MAILER } from '../auth/mailer/mailer.interface';
import { SmtpMailer } from '../auth/mailer/smtp-mailer.service';

@Module({
  controllers: [MembersController],
  providers: [
    MembershipService,
    PrismaClient,
    { provide: MAILER, useClass: SmtpMailer },
  ],
  exports: [MembershipService],
})
export class MembersModule {}
