import { SetMetadata } from '@nestjs/common';

export const TENANT_STATUS_KEY = 'tenant-status';
export const ALLOW_SUSPENDED_KEY = 'allow-suspended';
export const RequireTenantStatus = (...statuses: string[]) =>
  SetMetadata(TENANT_STATUS_KEY, statuses);
export const AllowWhenSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);
