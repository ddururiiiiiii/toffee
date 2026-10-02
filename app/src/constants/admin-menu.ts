/** 운영자 메뉴 — 운영자 홈 목록과 PC 웹 왼쪽 메뉴가 같이 씀. 운영자 화면은 한국어 전용 */
export type AdminHref =
  | '/admin'
  | '/admin/reports'
  | '/admin/banned-words'
  | '/admin/users'
  | '/admin/actors'
  | '/admin/bundles'
  | '/admin/agencies'
  | '/admin/stats'
  | '/admin/settlements'
  | '/admin/refunds'
  | '/admin/actions';

export const ADMIN_MENU: { href: AdminHref; label: string; description: string; webOnly?: boolean }[] = [
  { href: '/admin/stats', label: '통계', description: '가입·구독·해지 추이, 국가·가입 경로, 아티스트별 구독(PC에서 넓게)' },
  { href: '/admin/settlements', label: '정산', description: '월별 결제액·스토어 수수료·소속사 지급액, CSV(PC 웹 전용)', webOnly: true },
  { href: '/admin/reports', label: '신고 처리', description: '신고된 메시지를 검토하고 승인/기각해요' },
  { href: '/admin/banned-words', label: '금칙어 관리', description: '팬 답장에서 자동으로 차단할 단어를 관리해요' },
  { href: '/admin/users', label: '회원 관리', description: '회원 정지·영구차단, 아티스트·소속사 직원 계정 지정' },
  { href: '/admin/actors', label: '아티스트 관리', description: '아티스트 등록, 프로필 사진, 소속사 이적, 본인 계정 연결' },
  { href: '/admin/bundles', label: '묶음 상품', description: '여러 아티스트를 할인가로 묶어 파는 구독 상품, 스토어 상품 ID' },
  { href: '/admin/agencies', label: '소속사 관리', description: '소속사 등록, 이름·로고·정산 배분율' },
  { href: '/admin/refunds', label: '환불 요청', description: '아티스트 미발송·활동 종료 환불 요청, 애플 환불 여부, 아티스트·소속사별' },
  { href: '/admin/actions', label: '작업 기록', description: '누가 언제 정지·차단·역할 변경·신고 처리·가격·정산 비율을 바꿨는지' },
];
