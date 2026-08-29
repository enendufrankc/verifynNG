import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  oemId!: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  count!: number;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
