import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ListRepliesQueryDto {
  // 특정 스타 메시지에 달린 팬 답장만 — 참조 ID라 @IsUUID 대신 @IsString
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  messageId?: string;

  // 나눠 받기(스타 답장 화면: 최근 N개 → 위로 올리면 before로 이전 N개). 없으면 전부(콘솔 기존 동작)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  // 이 답장 id보다 이전(오래된) 것만 — 참조 ID라 @IsString
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  before?: string;
}

/** 팬 채팅방 나눠 받기 — limit(1~200)를 주면 최신 → 오래된 순, before(메시지 id) 이전 것 */
export class ListMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  before?: string;
}

/** 팬 채팅방 안 검색(2026-09-29) — q는 2~50자, 최신 → 오래된 순으로 limit개(before 이전) */
export class SearchMessagesQueryDto extends ListMessagesQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  q!: string;
}
