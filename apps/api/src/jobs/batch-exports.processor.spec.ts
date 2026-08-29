import { describe, expect, it, vi } from 'vitest';

const renderer = vi.hoisted(() => ({
  renderToBuffer: vi.fn(async () => Buffer.from('%PDF-1.7 test sheet')),
}));

vi.mock('@react-pdf/renderer', () => ({
  Document: 'Document',
  Image: 'Image',
  Page: 'Page',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  renderToBuffer: renderer.renderToBuffer,
}));

import { BatchExportsProcessor } from './batch-exports.processor';

const units = [
  {
    serial: 1,
    tier1Code: 'public-code-1',
    tier2Code: 'hidden-code-1',
    tier1Url: 'https://verify.example/v/public-code-1',
    tier2Url: 'https://verify.example/v/hidden-code-1',
  },
  {
    serial: 2,
    tier1Code: 'public-code-2',
    tier2Code: 'hidden-code-2',
    tier1Url: 'https://verify.example/v/public-code-2',
    tier2Url: 'https://verify.example/v/hidden-code-2',
  },
];

function processor(): BatchExportsProcessor {
  return new BatchExportsProcessor({} as never, {} as never, {} as never, {} as never);
}

describe('BatchExportsProcessor renderers', () => {
  it('creates deterministic tier-1 CSV rows', () => {
    expect(processor()['generateCsv'](units)).toEqual(
      Buffer.from(
        [
          'serial,tier1Code,url',
          '1,public-code-1,https://verify.example/v/public-code-1',
          '2,public-code-2,https://verify.example/v/public-code-2',
        ].join('\n'),
        'utf8',
      ),
    );
  });

  it('renders the two-tier application sheet through React PDF', async () => {
    const result = await processor()['generateSheetPdf'](
      {
        id: 'batch-12345678',
        product: { name: 'Body Wash' },
        oem: { name: 'Guiba OEM' },
      },
      units,
      'IVORY GLOW',
    );

    expect(result).toEqual(Buffer.from('%PDF-1.7 test sheet'));
    expect(renderer.renderToBuffer).toHaveBeenCalledOnce();
  });
});
