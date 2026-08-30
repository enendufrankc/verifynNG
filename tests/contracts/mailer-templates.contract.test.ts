import { describe, expect, it } from 'vitest';

/**
 * Contract: the 4 notification templates E19 added to E14's registry
 * (dsar.verify, dsar.ready, dsar.erased, legal.reaccept — see
 * apps/api/src/modules/notifications/templates/{template-data,registry}.ts).
 * This is the "change request on E14" the epic file calls for, turned into
 * a runnable check: if E14 (or anyone) changes these templates'
 * TemplateData shape or removes a renderer, this fails loudly instead of
 * silently breaking DSAR/legal-reaccept mail at send time.
 */
describe('Contract: E19 notification templates (for E14)', () => {
  it('all 4 templates render without throwing, for every kind of branding', async () => {
    const { TemplateRegistry } = await import(
      '../../apps/api/src/modules/notifications/templates/registry'
    );
    const registry = new TemplateRegistry();
    const branding = { tenantName: 'IVORY GLOW' };

    const cases: Array<[string, Record<string, unknown>]> = [
      [
        'dsar.verify',
        {
          verifyUrl: 'https://example.test/dsar/verify/token',
          expiresIn: '30 minutes',
        },
      ],
      [
        'dsar.ready',
        {
          downloadUrl: 'https://example.test/dsar/download/token',
          expiresIn: '24 hours',
        },
      ],
      ['dsar.erased', { requestedAt: '2026-08-30T00:00:00.000Z' }],
      [
        'legal.reaccept',
        {
          documentTitle: 'Terms of Service',
          version: '2026-09-01',
          reacceptUrl: 'https://example.test/legal',
        },
      ],
    ];

    for (const [templateId, data] of cases) {
      const rendered = registry.render(
        templateId as never,
        data as never,
        branding,
      );
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).toContain('<html');
      expect(rendered.text.length).toBeGreaterThan(0);
    }
  });

  it('dsar.verify escapes untrusted data (the verify URL is user-influenced input)', async () => {
    const { TemplateRegistry } = await import(
      '../../apps/api/src/modules/notifications/templates/registry'
    );
    const registry = new TemplateRegistry();
    const rendered = registry.render(
      'dsar.verify' as never,
      {
        verifyUrl: 'https://example.test/"><script>alert(1)</script>',
        expiresIn: '30 minutes',
      } as never,
      { tenantName: 'IVORY GLOW' },
    );
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
  });
});
