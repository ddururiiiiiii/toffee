import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

export class SettlementQueryDto {
  // YYYY-MM(태국 시간 기준 한 달)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;

  // 테스트(샌드박스) 결제 포함 — 없으면 샌드박스 구독이 켜진 환경에서만 포함
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeSandbox?: boolean;

  // 운영자만: 한 소속사만 보기(참조 ID라 @IsString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agencyId?: string;

  // CSV: 배우×방 단위로
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  detail?: boolean;
}

/** 지급 기록(운영자) — 받는 쪽은 소속사(agencyId) 또는 무소속 배우(actorId) 중 하나 */
export class SettlementPayoutDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agencyId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  actorId?: string;

  // 실제 보낸 금액(없으면 마감한 표의 지급액)
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  // 보낸 날(없으면 지금)
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;
}
