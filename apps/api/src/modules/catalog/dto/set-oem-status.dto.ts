import { IsEnum } from 'class-validator';

export class SetOemStatusDto {
  @IsEnum(['active', 'suspended'])
  status!: 'active' | 'suspended';
}
