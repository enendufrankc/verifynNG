import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SenderIdentity } from '../ports/mailer.port';
import { BrandingData } from '../templates/template-data';
import { ConfigService } from '@nestjs/config';

export interface ResolvedBranding extends BrandingData {
  sender: SenderIdentity;
}

@Injectable()
export class BrandingResolver {
  private defaultFrom: SenderIdentity;

  constructor(
    private prisma: PrismaClient,
    private config: ConfigService,
  ) {
    const fromStr = this.config.get('NOTIFICATIONS_FROM') ?? 'VerifyN <noreply@verifyn.ng>';
    const match = fromStr.match(/^(.+?)\s*<(.+)>$/);
    if (match) {
      this.defaultFrom = { fromName: match[1].trim(), fromAddress: match[2].trim() };
    } else {
      this.defaultFrom = { fromName: 'VerifyN', fromAddress: fromStr };
    }
  }

  async for(tenantId?: string): Promise<ResolvedBranding> {
    let tenantName = 'VerifyN';
    let logoUrl: string | undefined;
    let primaryColor: string | undefined;

    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      if (tenant) {
        tenantName = tenant.name;
      }
    }

    // Check for verified sender identity override
    let sender = { ...this.defaultFrom };
    if (tenantId) {
      const senderIdentity =
        await this.prisma.tenantSenderIdentity.findUnique({
          where: { tenantId_channel: { tenantId, channel: 'email' } },
        });
      if (senderIdentity?.verificationStatus === 'verified') {
        sender = {
          fromName: senderIdentity.fromName,
          fromAddress: senderIdentity.fromAddress,
          replyTo: senderIdentity.replyTo ?? undefined,
        };
      }
    }

    return {
      tenantName,
      logoUrl,
      primaryColor,
      sender,
    };
  }
}
