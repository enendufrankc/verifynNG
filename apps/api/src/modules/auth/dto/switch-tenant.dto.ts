import { IsString } from 'class-validator';

export class SwitchTenantDto {
  @IsString()
  tenantId!: string;
}
