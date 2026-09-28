import { IsNotEmpty, IsString } from 'class-validator';

export class LineLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
