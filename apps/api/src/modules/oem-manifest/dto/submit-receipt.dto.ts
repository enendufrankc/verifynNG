import { ArrayMinSize, IsArray, IsInt, IsString, Min } from 'class-validator';

export class SubmitReceiptDto {
  @IsString()
  receiptHash!: string;

  @IsInt()
  @Min(0)
  codeCount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  watermarks!: string[];
}
