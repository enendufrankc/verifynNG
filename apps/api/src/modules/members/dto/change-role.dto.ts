import { IsIn } from 'class-validator';
import { TenantRole } from '@prisma/client';

export class ChangeRoleDto {
  @IsIn(['owner', 'operator', 'viewer'])
  role!: TenantRole;
}
