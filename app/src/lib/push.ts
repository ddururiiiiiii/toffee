// 웹용(푸시 없음) — 실제 구현은 push.native.ts. 두 파일의 내보내는 모양을 똑같이 유지할 것.
// 웹 푸시(브라우저 알림)는 1차 범위 밖.

export interface PushData {
  type?: string;
  actorId?: string;
  messageId?: string;
  title?: string;
  body?: string;
}

export async function registerThisDevice(): Promise<void> {}

export async function unregisterThisDevice(): Promise<void> {}

export function subscribeTokenRefresh(): () => void {
  return () => {};
}

export function subscribeNotificationOpens(_onOpen: (data: PushData) => void): () => void {
  return () => {};
}

export function subscribeForegroundMessages(_onMessage: (data: PushData) => void): () => void {
  return () => {};
}

export function setAppBadgeCount(_count: number): void {}
