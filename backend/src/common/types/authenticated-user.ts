import { Role } from '../../generated/prisma/enums.js';

/** JwtStrategy가 req.user에 심는 값 — DB 풀 로드가 아니라 인가에 필요한 최소한만 */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}
