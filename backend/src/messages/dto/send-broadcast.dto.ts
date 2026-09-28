import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { MessageMediaType } from '../../generated/prisma/enums.js';

export class SendBroadcastDto {
  @IsEnum(MessageMediaType)
  mediaType!: MessageMediaType;

  // 텍스트일 땐 본문 필수, 사진/음성/영상일 땐 캡션 성격이라 선택
  @ValidateIf((dto: SendBroadcastDto) => dto.mediaType === MessageMediaType.TEXT || !!dto.body)
  @IsString()
  @MaxLength(1000)
  body?: string;

  // 미디어는 POST /actors/:actorId/uploads(purpose: message)로 먼저 올린 뒤 받은 objectKey를 넘김 —
  // 외부 URL은 받지 않음(링크 유출/추적 픽셀/핫링크 방지, 구독자 전용 접근 보장)
  @ValidateIf((dto: SendBroadcastDto) => dto.mediaType !== MessageMediaType.TEXT)
  @IsString()
  @IsNotEmpty()
  mediaKey?: string;
}
