import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTicketDto {
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
  @MaxLength(500)
  pageUrl?: string;
}
