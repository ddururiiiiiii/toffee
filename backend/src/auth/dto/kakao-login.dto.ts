import { IsNotEmpty, IsString } from 'class-validator';

export class KakaoLoginDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
