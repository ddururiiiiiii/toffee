import { IsEnum, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { MessageMediaType } from '../../generated/prisma/enums.js';

export class SendBroadcastDto {
  @IsEnum(MessageMediaType)
  mediaType!: MessageMediaType;

  // 텍스트일 땐 본문 필수, 사진/음성일 땐 캡션 성격이라 선택
  @ValidateIf((dto: SendBroadcastDto) => dto.mediaType === MessageMediaType.TEXT || !!dto.body)
  @IsString()
  @MaxLength(1000)
  body?: string;

  @ValidateIf((dto: SendBroadcastDto) => dto.mediaType !== MessageMediaType.TEXT)
  @IsUrl()
  mediaUrl?: string;
}
