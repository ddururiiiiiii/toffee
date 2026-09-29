import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

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
