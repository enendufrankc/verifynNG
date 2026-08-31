import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'https://erp.example.com/webhooks/verifyng' })
  @IsString()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  url!: string;

  @ApiProperty({
    type: [String],
    example: ['unit.flagged'],
    description:
      'Event names from the catalogue, or ["*"] to subscribe to everything.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events!: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
