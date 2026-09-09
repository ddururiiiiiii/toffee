import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LineLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @IsOptional()
  @IsBoolean()
  agreedToTerms?: boolean;
}
