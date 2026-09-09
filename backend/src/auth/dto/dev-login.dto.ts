import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DevLoginDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  // Prisma의 생성된 enum을 그대로 DTO에 끌어오지 않으려고 문자열 화이트리스트로 검증
  @IsOptional()
  @IsIn(['USER', 'AGENCY_STAFF', 'ADMIN'])
  role?: 'USER' | 'AGENCY_STAFF' | 'ADMIN';
}
