import type { Page } from '@playwright/test';

/**
 * Completes payment on E15's fake-pay hosted checkout page
 * (`tools/fakes/pay`) — the browser must already be there (i.e. the caller
 * navigated via a real `checkoutUrl` redirect from `PaymentService.
 * initialise`/`changePlan`'s "pay now" flow first, not a direct `page.goto`
 * to `:4102`, since the reference in the URL is the real one the backend
 * created). The card-last4 field is pre-filled by the checkout page itself;
 * clicking Pay fires a real signed `charge.success` webhook to the API,
 * same as a real Paystack checkout would.
 */
export async function payOnFakeCheckout(
  page: Page,
): Promise<{ success: boolean }> {
  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await page.waitForURL(/result=success/, { timeout: 15_000 });
  return { success: true };
}
