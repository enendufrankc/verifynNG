import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCannedResponseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}
