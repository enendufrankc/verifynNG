export function applyTenantTheme(
  el: HTMLElement,
  branding: { primaryColor?: string; accentColor?: string },
): void {
  if (branding.primaryColor) {
    el.style.setProperty('--color-brand', branding.primaryColor);
    el.style.setProperty('--color-brand-strong', branding.primaryColor);
    el.style.setProperty('--color-brand-text', branding.primaryColor);
  }
  if (branding.accentColor) {
    el.style.setProperty('--color-brand-ink', branding.accentColor);
  }
}
