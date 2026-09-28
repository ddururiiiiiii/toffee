import { IsString, ValidateIf } from 'class-validator';

// 배우/스태프의 소속사 지정 — null이면 무소속으로 되돌림(필드 자체는 필수라 실수로 빠뜨리면 400).
// 참조 ID라 @IsUUID 대신 @IsString, 존재 여부는 서비스에서 확인.
export class AssignAgencyDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  agencyId!: string | null;
}
