import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePublicBatchDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  oemId!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  count!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
