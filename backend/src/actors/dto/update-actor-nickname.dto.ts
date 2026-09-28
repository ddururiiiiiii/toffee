import { IsString, MaxLength } from 'class-validator';

// 세부 규칙(길이·금지 문자·예약어)은 normalizeNickname에서 — 여기선 터무니없이 긴 입력만 먼저 거름
export class UpdateActorNicknameDto {
  @IsString()
  @MaxLength(100)
  nickname!: string;
}
