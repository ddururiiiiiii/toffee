import { IsDateString } from 'class-validator';

export class SuspendUserDto {
  // 정지 해제 시각(ISO) — 이 시각이 지나면 로그인 시 자동으로 다시 활성 취급됨
  @IsDateString()
  until!: string;
}
