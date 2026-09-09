import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class NaverLoginDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @IsOptional()
  @IsBoolean()
  agreedToTerms?: boolean;
}
