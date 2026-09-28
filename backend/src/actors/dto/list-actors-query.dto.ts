import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListActorsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  // 소속사별 배우 목록 — 참조 ID라 @IsUUID 대신 @IsString (없는 ID면 빈 목록이 나올 뿐)
  @IsOptional()
  @IsString()
  agencyId?: string;

  // Discover 화면 정렬 — trending(구독 이력이 많은 순, 해지 포함 — Prisma 정렬에 조건을 못 걸어서), new(최근 등록 순), 없으면 이름순.
  // 구독자 수 자체는 응답에 넣지 않음(배우별 팬 수는 공개하지 않는 정보)
  @IsOptional()
  @IsIn(['trending', 'new'])
  sort?: 'trending' | 'new';
}
