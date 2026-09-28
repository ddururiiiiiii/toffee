import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { PROFILE_IMAGE_TARGETS, type ProfileImageTarget } from '../../storage/media-policy.js';

// 운영자용 프로필 이미지(배우 사진·소속사 로고) 업로드 발급 — 사진만
export class CreateProfileUploadDto {
  @IsIn(PROFILE_IMAGE_TARGETS)
  target!: ProfileImageTarget;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
