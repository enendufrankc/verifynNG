import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ROLE_KEY = 'platformRole';
export const PlatformRole = (role: string) =>
  SetMetadata(PLATFORM_ROLE_KEY, role);
