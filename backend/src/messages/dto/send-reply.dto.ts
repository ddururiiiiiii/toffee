import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// 팬 답장은 텍스트만 — 사진/영상/음성은 아티스트→팬 방향에서만 허용
export class SendReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body!: string;
}
