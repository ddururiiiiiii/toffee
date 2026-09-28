import { IsString, MaxLength } from 'class-validator';

// 세부 규칙(길이·예약어·제어문자)은 common/nickname/nickname.ts에서 — 여기선 형식만
export class UpdateNicknameDto {
  @IsString()
  @MaxLength(100)
  nickname!: string;
}
