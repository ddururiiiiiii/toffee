import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
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

  // 영상 썸네일(선택) — 영상을 올릴 때 같이 올린 첫 장면 사진의 objectKey(purpose message, PHOTO). 영상이 아니면 무시
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  thumbnailKey?: string;

  // 부가 정보(선택) — 길이는 음성·영상, 음파는 음성일 때만 저장, 그 외엔 무시
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30 * 60 * 1000)
  durationMs?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(1, { each: true })
  waveform?: number[];

  // 인용 답장(선택) — 같은 배우 채널의 팬 메시지 id. 전체 구독자에게 보이고 팬은 닉네임으로 표시됨.
  // 참조 ID라 @IsUUID 대신 @IsString
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replyToMessageId?: string;
}
