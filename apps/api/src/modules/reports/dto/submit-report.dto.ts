import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';

enum PurchaseChannelDto {
  open_market = 'open_market',
  street_vendor = 'street_vendor',
  online_marketplace = 'online_marketplace',
  social_media = 'social_media',
  pharmacy = 'pharmacy',
  supermarket = 'supermarket',
  brand_store = 'brand_store',
  other = 'other',
}

class ContactDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsBoolean()
  consent!: boolean;
}

export class SubmitReportDto {
  @IsString()
  @IsNotEmpty()
  scanEventId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sellerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sellerLocation?: string;

  @IsEnum(PurchaseChannelDto)
  purchaseChannel!: PurchaseChannelDto;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  photoIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactDto)
  contact?: ContactDto;

  @IsString()
  @IsNotEmpty()
  captchaToken!: string;
}
