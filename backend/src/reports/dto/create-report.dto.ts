import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportCategory } from '../../generated/prisma/enums.js';

export class CreateReportDto {
  // messageId는 참조 ID라 형식이 바뀔 수 있으므로 @IsUUID()로 고정하지 않음
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsEnum(ReportCategory)
  category!: ReportCategory;

  // 자세한 사유(선택)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
