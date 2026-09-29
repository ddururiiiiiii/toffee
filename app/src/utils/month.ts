// 정산 화면 달 계산(태국 시간 기준, 서버 monthRange와 같은 기준) — 순수 함수라 테스트용으로 분리
/** 지금 달(태국 시간) YYYY-MM */
export function currentMonth(now = new Date()): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${bangkok.getUTCFullYear()}-${String(bangkok.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
