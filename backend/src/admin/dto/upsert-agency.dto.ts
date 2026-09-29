import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

  // 정산 배분율(스토어 수수료 뺀 금액 중 소속사 몫 %) — null이면 기본값으로 되돌림
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  revenueSharePercent?: number | null;
}
