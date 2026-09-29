/** 장기 미발송 알림 설정(잠정 — STATUS "출시 전 확정할 정책"). 설정값으로 바꿀 수 있음 */
export interface IdleReminderRule {
  /** 배우에게 처음 알리는 날(마지막 메시지 후) */
  firstDays: number;
  /** 배우에게 다시 + 소속사에도 알리는 날 */
  escalateDays: number;
  /** 그 뒤로 이 간격마다 한 번 */
  repeatDays: number;
  /** 이만큼 안 보내면 팬이 그 달 환불을 요청할 수 있음(2026-09-29) — 3일 전·하루 전에 배우·소속사·운영자에게 경고 */
  refundDays: number;
}

export const DEFAULT_IDLE_RULE: IdleReminderRule = { firstDays: 3, escalateDays: 7, repeatDays: 7, refundDays: 30 };

/** 환불 기준 며칠 전에 경고하나(3일 전, 하루 전) */
export const REFUND_WARNING_DAYS_BEFORE = [3, 1] as const;

/** 이 단계가 환불 기준 경고(3일 전·하루 전)면 남은 날 수, 아니면 null */
export function refundWarningLeft(stage: number, rule: IdleReminderRule = DEFAULT_IDLE_RULE): number | null {
  const left = rule.refundDays - stage;
  return (REFUND_WARNING_DAYS_BEFORE as readonly number[]).includes(left) ? left : null;
}

/**
 * 며칠째 안 보냈는지 → 알림 단계(0 = 아직 아님). 3일 → 3, 7~13일 → 7, 14~20일 → 14, 21~26일 → 21, 환불 기준(30일) 3일 전 27~28일 → 27,
 * 하루 전 29일 → 29, 그 뒤 35일 → 35 … — 같은 단계는 한 번만(더 낮은 단계는 다시 안 보냄) 보내서 매일 울리지 않게. 28일(7일 간격)은 경고로 대신함.
 */
export function idleStage(days: number, rule: IdleReminderRule = DEFAULT_IDLE_RULE): number {
  if (days < rule.firstDays) return 0;
  if (days < rule.escalateDays) return rule.firstDays;
  const repeat = rule.escalateDays + rule.repeatDays * Math.floor((days - rule.escalateDays) / rule.repeatDays);
  // 환불 기준 직전(27~29일)엔 경고 단계만 — 그 사이 7일 간격 알림(28일)은 건너뜀
  const warning = REFUND_WARNING_DAYS_BEFORE.map((before) => rule.refundDays - before)
    .filter((day) => day >= rule.escalateDays && days >= day && days < rule.refundDays)
    .reduce((max, day) => Math.max(max, day), 0);
  return warning > 0 ? warning : repeat;
}
