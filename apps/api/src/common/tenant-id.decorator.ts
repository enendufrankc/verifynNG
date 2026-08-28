import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Placeholder decorator — E02 will back this with real auth.
 * Currently returns a hardcoded value for development.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): string => {
    return 'ivoryglow'; // placeholder until E02 ships auth
  },
);
