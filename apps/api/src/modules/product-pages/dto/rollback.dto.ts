import { IsString, IsNotEmpty } from 'class-validator';

export class RollbackDto {
  @IsString()
  @IsNotEmpty()
  versionId!: string;
}
