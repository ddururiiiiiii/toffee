import { IsEnum, IsNotEmpty, IsString, NotEquals } from 'class-validator';
import { MessageMediaType } from '../../generated/prisma/enums.js';

// 스토리는 항상 미디어가 있어야 함 — 텍스트 전용 스토리는 없음
export class CreateStoryDto {
  @IsEnum(MessageMediaType)
  @NotEquals(MessageMediaType.TEXT)
  mediaType!: MessageMediaType;

  // POST /actors/:actorId/uploads(purpose: story)로 올린 objectKey
  @IsString()
  @IsNotEmpty()
  mediaKey!: string;
}
