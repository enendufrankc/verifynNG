import { IsEmail, IsIn } from 'class-validator';

export class InviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['owner', 'operator', 'viewer'])
  role!: string;
}
