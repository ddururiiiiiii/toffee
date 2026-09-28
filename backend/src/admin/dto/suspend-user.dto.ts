import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportCategory } from '../../generated/prisma/enums.js';

export class SuspendUserDto {
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // 정지 해제 시각(ISO) — 이 시각이 지나면 로그인 시 자동으로 다시 활성 취급됨
  @IsDateString()
  until!: string;
}

/** 정지·영구차단 사유 — 분류(당사자에게 번역해서 안내)와 내부 메모(운영자만) */
export class SanctionReasonDto {
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
