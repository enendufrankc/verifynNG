import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class InviteOemUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;
}
