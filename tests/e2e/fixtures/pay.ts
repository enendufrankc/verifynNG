import type { Page } from '@playwright/test';

/**
 * TODO(E15): Uses E15's fake-pay checkout at :4102. Currently a stub.
 */
export async function payOnFakeCheckout(
  _page: Page,
): Promise<{ success: boolean }> {
  // TODO(E15): navigate to fake-pay checkout and complete payment
  return { success: true };
}
