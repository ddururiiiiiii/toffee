import { IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  // 배우 본인 계정 연결·스태프 배정 화면에서 해당 역할 계정만 고를 때
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;
}
