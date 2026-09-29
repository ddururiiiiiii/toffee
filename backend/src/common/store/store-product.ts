import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { appError } from '../i18n/app-error.js';

/**
 * 스토어 구독 상품 ID 규칙 — 애플·구글 공통으로 쓸 수 있는 형식만(구글: 소문자·숫자로 시작, 소문자·숫자·_·.만,
 * 애플: 영문·숫자·_·.만). 예전 규칙 `toffee_sub_{배우ID}`는 배우 ID(UUID)의 하이픈 때문에 둘 다 등록 불가였음
 * → 운영자가 배우·묶음마다 직접 입력(2026-09-29). 예: toffee.actor.nawin, toffee.bundle.nawin_pakin
 */
export const STORE_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9_.]{0,99}$/;

// 가격은 사타앙(1/100바트) 단위 정수 — 실제 결제 금액은 스토어 상품 가격이 기준이고, 이 값은 앱 표시·정산 배분용.
// 상한은 오입력 방지용 잠정값(฿10,000).
export const MAX_PRICE_CENTS = 1_000_000;

/** 스토어 상품 ID는 배우·묶음 통틀어 하나에만 — 같은 상품을 사면 어느 방을 열어 줄지 헷갈리지 않게 */
export async function ensureStoreProductIdFree(
  prisma: PrismaService,
  storeProductId: string | null | undefined,
  owner: { actorId?: string; bundleId?: string },
): Promise<void> {
  if (!storeProductId) return;
  const [actor, bundle] = await Promise.all([
    prisma.actor.findUnique({ where: { storeProductId }, select: { id: true } }),
    prisma.bundle.findUnique({ where: { storeProductId }, select: { id: true } }),
  ]);
  if ((actor && actor.id !== owner.actorId) || (bundle && bundle.id !== owner.bundleId)) {
    throw new ConflictException(appError('STORE_PRODUCT_ID_TAKEN'));
  }
}
