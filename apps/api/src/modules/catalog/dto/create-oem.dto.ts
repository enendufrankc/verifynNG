import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateOemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  notes?: string;
}
