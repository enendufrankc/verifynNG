import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// E02 will implement a RolesGuard that reads this metadata.
// Until then, all routes are accessible to all callers.
