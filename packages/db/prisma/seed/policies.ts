import type { PrismaClient } from '@prisma/client';

export async function seedPolicies(prisma: PrismaClient): Promise<void> {
  await prisma.policyDocument.upsert({
    where: {
      kind_locale_version: { kind: 'aup', locale: 'en', version: '2026-08-01' },
    },
    update: {},
    create: {
      kind: 'aup',
      version: '2026-08-01',
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      markdown:
        'Only authenticate goods for marks you own or are authorised to represent. The platform may suspend accounts when there is evidence of counterfeiting.',
    },
  });
  await prisma.policyDocument.upsert({
    where: {
      kind_locale_version: { kind: 'tos', locale: 'en', version: '2026-08-01' },
    },
    update: {},
    create: {
      kind: 'tos',
      version: '2026-08-01',
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      markdown:
        'The platform may suspend service on evidence of counterfeiting, abuse, or unlawful use. You remain responsible for the marks and goods you submit.',
    },
  });
}
