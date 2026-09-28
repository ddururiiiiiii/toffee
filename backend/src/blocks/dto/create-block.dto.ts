import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlockDto {
  // 참조 ID라 @IsUUID 대신 @IsString
  @IsString()
  @IsNotEmpty()
  fanUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
