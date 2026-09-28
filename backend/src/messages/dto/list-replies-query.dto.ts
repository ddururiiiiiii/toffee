import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ListRepliesQueryDto {
  // 특정 스타 메시지에 달린 팬 답장만 — 참조 ID라 @IsUUID 대신 @IsString
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  messageId?: string;
}
