import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/** 지정한 Role만 접근 허용 (RolesGuard가 읽음). 안 붙이면 로그인만 되어 있으면 통과 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
