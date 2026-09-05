import type { Currency } from './billing';

const SYMBOLS: Record<Currency, string> = { NGN: '₦', GBP: '£' };

/** Minor units (kobo/pence) -> "₦66,000.00" / "£100.00" — mirrors apps/api's InvoiceService currency.util.ts. */
export function formatMinor(amountMinor: number, currency: Currency): string {
  const major = amountMinor / 100;
  return `${SYMBOLS[currency]}${major.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
