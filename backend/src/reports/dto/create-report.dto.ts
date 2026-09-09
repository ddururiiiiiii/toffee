import { IsNotEmpty, IsString } from 'class-validator';

export class CreateReportDto {
  // messageId는 참조 ID라 형식이 바뀔 수 있으므로 @IsUUID()로 고정하지 않음
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
