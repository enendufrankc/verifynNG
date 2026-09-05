import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { API_KEY_SCOPES } from '../scopes.js';

export class CreateApiKeyDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes!: string[];

  @IsOptional()
  @IsIn(['live', 'test'])
  mode?: 'live' | 'test';

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
