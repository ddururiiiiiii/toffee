import { IsIn } from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

// 운영자 계정(ADMIN)은 API로 만들거나 바꾸지 않음 — 권한 상승 경로를 없애기 위해 DB에서 직접
export const ASSIGNABLE_ROLES = [Role.USER, Role.ACTOR, Role.AGENCY_STAFF] as const;

export class ChangeRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role!: (typeof ASSIGNABLE_ROLES)[number];
}
