import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReportNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
