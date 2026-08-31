import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddNoteDto {
  @IsIn(['internal', 'reply'])
  kind!: 'internal' | 'reply';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsString()
  cannedResponseId?: string;
}
