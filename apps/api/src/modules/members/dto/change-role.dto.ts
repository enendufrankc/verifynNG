import { IsIn } from 'class-validator';

export class ChangeRoleDto {
  @IsIn(['owner', 'operator', 'viewer'])
  role!: string;
}
