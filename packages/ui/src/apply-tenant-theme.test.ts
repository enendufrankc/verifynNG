import { describe, it, expect } from 'vitest';
import { applyTenantTheme } from './apply-tenant-theme';

describe('applyTenantTheme', () => {
  it('overrides brand variables when primaryColor is provided', () => {
    const el = document.createElement('div');
    applyTenantTheme(el, { primaryColor: '#1E3A8A' });
    expect(el.style.getPropertyValue('--color-brand')).toBe('#1E3A8A');
    expect(el.style.getPropertyValue('--color-brand-strong')).toBe('#1E3A8A');
    expect(el.style.getPropertyValue('--color-brand-text')).toBe('#1E3A8A');
  });

  it('overrides brand-ink when accentColor is provided', () => {
    const el = document.createElement('div');
    applyTenantTheme(el, { accentColor: '#FFFFFF' });
    expect(el.style.getPropertyValue('--color-brand-ink')).toBe('#FFFFFF');
  });

  it('does not override verdict tokens', () => {
    const el = document.createElement('div');
    el.style.setProperty('--color-v-pos', '#14713A');
    applyTenantTheme(el, { primaryColor: '#FF0000' });
    expect(el.style.getPropertyValue('--color-v-pos')).toBe('#14713A');
  });

  it('no-ops when branding is empty', () => {
    const el = document.createElement('div');
    applyTenantTheme(el, {});
    expect(el.style.length).toBe(0);
  });
});
