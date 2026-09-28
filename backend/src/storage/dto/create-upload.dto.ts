import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { UPLOAD_PURPOSES, type UploadableMediaType, type UploadPurpose } from '../media-policy.js';

export class CreateUploadDto {
  @IsIn(UPLOAD_PURPOSES)
  purpose!: UploadPurpose;

  @IsIn(['PHOTO', 'AUDIO', 'VIDEO'])
  mediaType!: UploadableMediaType;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
