import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PublicSupportDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  code?: string;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;
}
