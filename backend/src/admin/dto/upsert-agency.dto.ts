import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAgencyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class UpdateAgencyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  // null을 보내면 로고 삭제
  @IsOptional()
  @IsString()
  logoUrl?: string | null;
}
