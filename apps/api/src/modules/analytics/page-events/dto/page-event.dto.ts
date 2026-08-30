import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const REFERRER_TYPES = ['qr', 'manual', 'camera', 'direct'] as const;

export class PageEventDto {
  @IsString()
  @MaxLength(100)
  tenantSlug!: string;

  @IsString()
  @MaxLength(200)
  route!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  verdict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  tier?: string;

  @IsString()
  @MaxLength(20)
  locale!: string;

  @IsIn(REFERRER_TYPES)
  referrerType!: (typeof REFERRER_TYPES)[number];
}
