/** 장기 미발송 알림 설정(잠정 — STATUS "출시 전 확정할 정책"). 설정값으로 바꿀 수 있음 */
export interface IdleReminderRule {
  /** 배우에게 처음 알리는 날(마지막 메시지 후) */
  firstDays: number;
  /** 배우에게 다시 + 소속사에도 알리는 날 */
  escalateDays: number;
  /** 그 뒤로 이 간격마다 한 번 */
  repeatDays: number;
}

export const DEFAULT_IDLE_RULE: IdleReminderRule = { firstDays: 3, escalateDays: 7, repeatDays: 7 };

/**
 * 며칠째 안 보냈는지 → 알림 단계(0 = 아직 아님). 3일 → 3, 7~13일 → 7, 14~20일 → 14 … — 같은 단계는 한 번만 보내서 매일 울리지 않게.
 */
export function idleStage(days: number, rule: IdleReminderRule = DEFAULT_IDLE_RULE): number {
  if (days < rule.firstDays) return 0;
  if (days < rule.escalateDays) return rule.firstDays;
  return rule.escalateDays + rule.repeatDays * Math.floor((days - rule.escalateDays) / rule.repeatDays);
}
