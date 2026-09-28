import { IsInt, IsNotEmpty, IsString, Min, ValidateIf } from 'class-validator';

export class CreateChatProfileUploadDto {
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

// 업로드로 받은 objectKey, null이면 사진 삭제
export class SetChatProfileImageDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  key!: string | null;
}
