import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  gtin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;
}
