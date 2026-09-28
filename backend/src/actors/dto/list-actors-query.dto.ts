import { IsOptional, IsString } from 'class-validator';

export class ListActorsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  // 소속사별 배우 목록 — 참조 ID라 @IsUUID 대신 @IsString (없는 ID면 빈 목록이 나올 뿐)
  @IsOptional()
  @IsString()
  agencyId?: string;
}
