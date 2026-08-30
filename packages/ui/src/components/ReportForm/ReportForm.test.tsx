import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportForm } from './ReportForm';

describe('ReportForm', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().endsWith('/reports')) {
        return new Response(
          JSON.stringify({ reference: 'RPT-ABC123', statusUrl: '/x' }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
  });

  it('walks details -> photos -> contact -> submit -> done', async () => {
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
        onSubmitted={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    fireEvent.change(screen.getByPlaceholderText(/ok-demo/i), {
      target: { value: 'ok-demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() =>
      expect(screen.getByText('Report submitted')).toBeInTheDocument(),
    );
    expect(screen.getByText('RPT-ABC123')).toBeInTheDocument();
  });

  it('disables submit until a captcha token is present', async () => {
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(
      screen.getByRole('button', { name: /submit report/i }),
    ).toBeDisabled();
  });

  it('only shows the consent checkbox once an email is entered, and requires it to submit', async () => {
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.com' },
    });
    expect(screen.getByRole('checkbox')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/ok-demo/i), {
      target: { value: 'ok-demo' },
    });
    expect(
      screen.getByRole('button', { name: /submit report/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(
      screen.getByRole('button', { name: /submit report/i }),
    ).not.toBeDisabled();
  });
});
