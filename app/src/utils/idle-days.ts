/** 마지막 스타 메시지 후 며칠 지났는지(없으면 null) — 운영자·소속사 목록의 미발송 표시 */
export function idleDays(lastBroadcastAt: string | null | undefined, now = Date.now()): number | null {
  if (!lastBroadcastAt) return null;
  return Math.floor((now - new Date(lastBroadcastAt).getTime()) / (24 * 60 * 60 * 1000));
}

// 서버의 장기 미발송 알림에서 소속사까지 알리는 날(IDLE_ESCALATE_DAYS 기본값과 같게) — 이 이상이면 빨간색
export const IDLE_WARN_DAYS = 7;
