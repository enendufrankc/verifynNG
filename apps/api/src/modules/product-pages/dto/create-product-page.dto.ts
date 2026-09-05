import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateProductPageDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  slug!: string;
}
