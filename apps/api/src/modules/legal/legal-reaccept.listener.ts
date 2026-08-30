import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { prisma } from '@verifynng/db';
import { loadEnv } from '@verifynng/config';
import { NotificationService } from '../notifications/notifications.service';

const TITLES: Record<string, string> = {
  terms: 'Terms of Service',
  aup: 'Acceptable Use Policy',
  privacy: 'Privacy Policy',
  cookie: 'Cookie Policy',
  subprocessors: 'Subprocessors',
};

interface LegalDocumentPublishedPayload {
  kind: string;
  version: string;
  requiresReacceptance?: boolean;
}

/**
 * `legal.document.published` fires for every publish; only a bump flagged
 * `requiresReacceptance` (today: terms/aup) actually blocks the console
 * (TenantStatusGuard), so only those mail every tenant owner platform-wide
 * — legal documents aren't tenant-scoped, so there's no "which tenant"
 * filter here.
 */
@Injectable()
export class LegalReacceptListener {
  constructor(private readonly notifications: NotificationService) {}

  @OnEvent('legal.document.published')
  async onPublished(payload: LegalDocumentPublishedPayload): Promise<void> {
    if (!payload.requiresReacceptance) return;
    if (payload.kind !== 'terms' && payload.kind !== 'aup') return;

    const owners = await prisma.membership.findMany({
      where: { role: 'owner' },
      include: { user: true },
    });
    const reacceptUrl = `${loadEnv().APP_BASE_URL}/legal`;
    for (const membership of owners) {
      await this.notifications.send(
        'legal.reaccept',
        { email: membership.user.email, userId: membership.userId },
        {
          documentTitle: TITLES[payload.kind] ?? payload.kind,
          version: payload.version,
          reacceptUrl,
        },
        { tenantId: membership.tenantId },
      );
    }
  }
}
