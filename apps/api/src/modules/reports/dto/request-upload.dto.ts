import { IsIn, IsInt, Max, Min, IsString, IsNotEmpty } from 'class-validator';

export class RequestUploadDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

  @IsInt()
  @Min(1)
  @Max(8_000_000)
  sizeBytes!: number;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;
}
