import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
