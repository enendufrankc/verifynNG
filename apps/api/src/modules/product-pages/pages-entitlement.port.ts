import { Injectable } from '@nestjs/common';

export const PAGES_ENTITLEMENT_PORT = 'PAGES_ENTITLEMENT_PORT';

export interface PagesEntitlementPort {
  canPublish(tenantId: string): Promise<boolean>;
}

/** Stands in until E15 ships plan gating for the page builder. */
@Injectable()
export class DefaultPagesEntitlementPort implements PagesEntitlementPort {
  async canPublish(_tenantId: string): Promise<boolean> {
    return true;
  }
}
