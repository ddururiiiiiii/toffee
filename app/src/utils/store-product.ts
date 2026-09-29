/**
 * 스토어 구독 상품 ID 규칙 — 서버(backend/src/common/store/store-product.ts)와 같게. 애플·구글 공통으로 쓸 수 있는
 * 형식(소문자·숫자로 시작, 소문자·숫자·_·.만). 예: toffee.actor.nawin, toffee.bundle.nawin_pakin
 */
export const STORE_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9_.]{0,99}$/;
