// Deliberately no JSX in this file: the toolchain's SSR module loader
// (Vite 8 / Rolldown, "ssrTransformScript") parses Vitest entry test files
// without a JSX-aware transform, even though `.tsx` files that are only
// *imported* (like the components under test) go through the normal
// build pipeline and compile fine — confirmed via `next build`. Using
// `React.createElement` here sidesteps that toolchain gap without
// weakening the assertions.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { DecommissionedVerdict } from './DecommissionedVerdict';
import { SuspiciousVerdict } from './SuspiciousVerdict';
import { UnknownVerdict } from './UnknownVerdict';
import { RateLimitedVerdict } from './RateLimitedVerdict';
import type { VerifyResponse } from '@/lib/api';

function base(overrides: Partial<VerifyResponse>): VerifyResponse {
  return {
    verdict: 'ok',
    severity: 'green',
    code: 'ivoryglow.1.k1.ABCD…',
    message: 'test message',
    reportable: false,
    ...overrides,
  };
}

describe('verdict components', () => {
  it('DecommissionedVerdict never shows a report prompt (the brand already knows)', () => {
    render(
      createElement(DecommissionedVerdict, {
        data: base({
          verdict: 'decommissioned',
          severity: 'red',
          reportable: false,
        }),
        redactedCode: 'ivoryglow.2.k1.ABCD…',
        locale: 'en',
      }),
    );
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByText(/counterfeit/i)).not.toBeInTheDocument();
  });

  it('SuspiciousVerdict shows the report prompt and region chips when reportable', () => {
    render(
      createElement(SuspiciousVerdict, {
        data: base({
          verdict: 'suspicious',
          severity: 'amber',
          reportable: true,
          history: {
            firstVerifiedAt: '2026-01-01T00:00:00.000Z',
            scanCount: 7,
            distinctRegions: ['Lagos, NG', 'Accra, GH'],
            lastVerifiedAt: '2026-08-01T00:00:00.000Z',
          },
        }),
        redactedCode: 'ivoryglow.2.k1.ABCD…',
        locale: 'en',
      }),
    );
    expect(screen.getByText('Check this')).toBeInTheDocument();
    expect(screen.getByText(/counterfeit/i)).toBeInTheDocument();
    expect(screen.getByText('Lagos, NG')).toBeInTheDocument();
    expect(screen.getByText('Accra, GH')).toBeInTheDocument();
  });

  it('UnknownVerdict gates the report prompt on `reportable`, not the verdict string', () => {
    render(
      createElement(UnknownVerdict, {
        data: base({ verdict: 'unknown', severity: 'red', reportable: false }),
        redactedCode: '***',
        locale: 'en',
      }),
    );
    expect(screen.getByText('Not recognised')).toBeInTheDocument();
    expect(screen.queryByText(/counterfeit/i)).not.toBeInTheDocument();
  });

  it('RateLimitedVerdict surfaces retryAfterSec in the message', () => {
    render(
      createElement(RateLimitedVerdict, {
        data: base({
          verdict: 'rate-limited',
          severity: 'grey',
          reportable: false,
          retryAfterSec: 42,
        }),
        redactedCode: '***',
        locale: 'en',
      }),
    );
    expect(screen.getByText(/42 seconds/)).toBeInTheDocument();
  });
});
