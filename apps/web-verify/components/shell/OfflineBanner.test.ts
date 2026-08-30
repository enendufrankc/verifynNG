import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OfflineBanner', () => {
  afterEach(() => {
    setOnline(true);
  });

  it('renders nothing while online', () => {
    setOnline(true);
    render(createElement(OfflineBanner));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the banner when offline at mount', () => {
    setOnline(false);
    render(createElement(OfflineBanner));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('reacts to online/offline window events', () => {
    setOnline(true);
    render(createElement(OfflineBanner));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
