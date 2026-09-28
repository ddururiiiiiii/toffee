import { IsNotEmpty, IsString } from 'class-validator';

export class NaverLoginDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
