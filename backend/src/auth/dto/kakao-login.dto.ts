import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class KakaoLoginDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @IsOptional()
  @IsBoolean()
  agreedToTerms?: boolean;
}
