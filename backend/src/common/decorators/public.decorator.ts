import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 로그인 없이 접근 가능한 라우트 표시 (전역 JwtAuthGuard를 건너뜀) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
