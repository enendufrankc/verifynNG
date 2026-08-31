import { IsArray, IsObject } from 'class-validator';

export class SaveDraftDto {
  @IsObject()
  theme!: Record<string, unknown>;

  @IsArray()
  blocks!: unknown[];

  @IsObject()
  seo!: Record<string, unknown>;
}
