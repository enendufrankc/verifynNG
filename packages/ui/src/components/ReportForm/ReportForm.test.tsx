import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportForm } from './ReportForm';

const UPLOAD_URL = 'https://storage.example.com/presigned-put';

function mockFetchWithPutStatus(putOk: boolean) {
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const href = url.toString();
    if (href.endsWith('/reports')) {
      return new Response(
        JSON.stringify({ reference: 'RPT-ABC123', statusUrl: '/x' }),
        { status: 200 },
      );
    }
    if (href.endsWith('/upload-url')) {
      return new Response(
        JSON.stringify({ photoId: 'photo1', uploadUrl: UPLOAD_URL }),
        { status: 200 },
      );
    }
    if (href === UPLOAD_URL) {
      return new Response(null, { status: putOk ? 200 : 500 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
}

describe('ReportForm', () => {
  beforeEach(() => {
    mockFetchWithPutStatus(true);
    (
      globalThis as unknown as { createImageBitmap: unknown }
    ).createImageBitmap = vi.fn(async () => ({ width: 800, height: 600 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('adds an uploaded photo to state once the presigned PUT succeeds', async () => {
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const file = new File([new Uint8Array(10)], 'photo.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByLabelText(/photos/i), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByText(/photo\.jpg — uploaded/i)).toBeInTheDocument(),
    );
  });

  it('does not add the photo to state and surfaces the error when the presigned PUT fails', async () => {
    mockFetchWithPutStatus(false);
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const file = new File([new Uint8Array(10)], 'photo.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByLabelText(/photos/i), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        UPLOAD_URL,
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    expect(
      screen.queryByText(/photo\.jpg — uploaded/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'photo_upload_failed',
      ),
    );
  });

  it('shows the submit error with role="alert" when submission fails', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (url.toString().endsWith('/reports')) {
        return new Response(JSON.stringify({ error: 'rate_limited' }), {
          status: 429,
        });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

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
    fireEvent.change(screen.getByPlaceholderText(/ok-demo/i), {
      target: { value: 'ok-demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('rate_limited'),
    );
  });

  it('shows a dev-mode warning and console.warns when captchaSiteKey is not provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

    expect(screen.getByText(/dev mode — captcha bypass/i)).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('renders the real captcha widget slot and does not warn when captchaSiteKey is provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <ReportForm
        tenantSlug="ivoryglow"
        scanEventId="scan1"
        verdict="red"
        apiBaseUrl="http://localhost:4000"
        captchaSiteKey="site-key-123"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(
      screen.queryByText(/dev mode — captcha bypass/i),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('turnstile-widget-slot')).toBeInTheDocument();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
