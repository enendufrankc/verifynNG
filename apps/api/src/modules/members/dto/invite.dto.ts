import { IsEmail, IsIn } from 'class-validator';
import { TenantRole } from '@prisma/client';

export class InviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['owner', 'operator', 'viewer'])
  role!: TenantRole;
}
