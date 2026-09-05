import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const SEED: Array<{ slug: string; title: string; body: string }> = [
  {
    slug: 'welcome',
    title: 'Welcome',
    body: 'Hi {{requesterName}}, thanks for reaching out about {{tenantName}} — happy to help with ticket #{{ticketNumber}}.',
  },
  {
    slug: 'label-application',
    title: 'Label application',
    body: "Hi {{requesterName}}, if the code isn't scanning it's usually the label rather than the code itself — see our label application guide for the scratch-off placement and print-quality checklist. Ref #{{ticketNumber}}.",
  },
  {
    slug: 'payment-failed',
    title: 'Payment failed',
    body: "Hi {{requesterName}}, we've flagged the failed payment on your account and retried it — you should see an updated invoice shortly. Ref #{{ticketNumber}}.",
  },
  {
    slug: 'code-not-found',
    title: 'Code not found',
    body: "Hi {{requesterName}}, we couldn't find a match for that code. Please double check it was entered exactly as printed, with no spaces. Ref #{{ticketNumber}}.",
  },
  {
    slug: 'escalation',
    title: 'Escalation',
    body: "Hi {{requesterName}}, I've escalated ticket #{{ticketNumber}} for {{tenantName}} to the team best placed to help — we'll follow up shortly.",
  },
];

export interface CannedResponseVars {
  requesterName?: string;
  requesterEmail?: string;
  tenantName?: string;
  ticketNumber?: number | string;
}

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaClient) {}

  async seedDefaults(): Promise<void> {
    for (const entry of SEED) {
      await this.prisma.cannedResponse.upsert({
        where: { slug: entry.slug },
        update: {},
        create: entry,
      });
    }
  }

  list() {
    return this.prisma.cannedResponse.findMany({ orderBy: { title: 'asc' } });
  }

  async get(id: string) {
    const response = await this.prisma.cannedResponse.findUnique({
      where: { id },
    });
    if (!response) throw new NotFoundException('canned_response_not_found');
    return response;
  }

  create(data: { slug: string; title: string; body: string }) {
    return this.prisma.cannedResponse.create({ data });
  }

  update(id: string, data: { title?: string; body?: string }) {
    return this.prisma.cannedResponse.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.cannedResponse.delete({ where: { id } });
  }

  /** Renders `{{var}}` placeholders — unknown vars are left as-is. */
  render(body: string, vars: CannedResponseVars): string {
    return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const value = (vars as Record<string, unknown>)[key];
      return value === undefined || value === null ? match : String(value);
    });
  }

  async renderById(id: string, vars: CannedResponseVars): Promise<string> {
    const response = await this.get(id);
    return this.render(response.body, vars);
  }
}
