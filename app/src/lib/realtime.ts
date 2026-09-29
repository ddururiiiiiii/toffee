import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { fetch } from 'expo/fetch';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { API_URL } from './env';
import i18n from '@/i18n';

/**
 * 실시간 신호(서버 `GET /realtime`, SSE) — 서버는 "어느 배우 채팅방이 바뀌었는지"만 보내고 내용은 안 보냄.
 * 앱은 신호를 받으면 해당 목록을 평소 API로 다시 불러옴(react-query invalidate). 연결이 살아 있는 동안엔
 * 폴링을 길게(30초, 혹시 놓친 신호 대비), 끊겨 있으면 예전처럼 짧게 — `useLiveInterval` (2026-09-29)
 */
interface RealtimeEvent {
  kind: 'artist-message' | 'message-removed' | 'fan-reply';
  actorId: string;
  messageId?: string;
}

let connected = false;
const listeners = new Set<() => void>();
function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(subscribe, () => connected, () => false);
}

/** 실시간 연결 중이면 느린 폴링(놓친 신호 대비), 아니면 원래 간격 */
export function useLiveInterval(fallbackMs: number): number {
  return useRealtimeConnected() ? 30_000 : fallbackMs;
}

function applyEvent(queryClient: QueryClient, event: RealtimeEvent) {
  const { actorId } = event;
  if (event.kind === 'fan-reply') {
    // 스타 화면(답장 줄·답장 수)·답장 채팅·소속사 답장 탭
    void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', actorId] });
    void queryClient.invalidateQueries({ queryKey: ['actor-replies', actorId] });
    return;
  }
  // 스타 메시지 도착·삭제 — 팬 채팅방·남은 답장 수·인박스, 스타·소속사 메시지 목록
  void queryClient.invalidateQueries({ queryKey: ['messages', actorId] });
  void queryClient.invalidateQueries({ queryKey: ['reply-quota', actorId] });
  void queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
  void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', actorId] });
  void queryClient.invalidateQueries({ queryKey: ['actor-replies', actorId] });
}

/** SSE 본문을 한 덩어리씩 잘라 이벤트로 — "event: x\ndata: {...}\n\n" */
function parseBlock(block: string): { type: string; data: string } | null {
  let type = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.length || type !== 'message' ? { type, data: data.join('\n') } : null;
}

/**
 * 로그인한 동안 연결을 유지(앱이 뒤로 가면 끊고, 돌아오면 다시). 끊기면 1초 → 최대 30초 간격으로 재시도.
 * `audienceKey`가 바뀌면(구독 목록이 바뀜) 다시 연결 — 서버가 받을 채팅방 목록을 연결 때 읽어서.
 */
export function useRealtimeSync(token: string | null, audienceKey: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;

    const scheduleRetry = () => {
      if (stopped || retryTimer || AppState.currentState !== 'active') return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
      delay = Math.min(delay * 2, 30_000);
    };

    const connect = async () => {
      if (stopped || controller) return;
      const current = new AbortController();
      controller = current;
      try {
        const res = await fetch(`${API_URL}/realtime`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', 'Accept-Language': i18n.language },
          signal: current.signal,
        });
        if (!res.ok || !res.body) throw new Error(`realtime ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let end = buffer.indexOf('\n\n');
          while (end >= 0) {
            const event = parseBlock(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
            end = buffer.indexOf('\n\n');
            if (!event) continue;
            if (event.type === 'ready') {
              setConnected(true);
              delay = 1000;
            } else if (event.type === 'change') {
              try {
                applyEvent(queryClient, JSON.parse(event.data) as RealtimeEvent);
              } catch {
                // 모르는 신호는 무시
              }
            }
          }
        }
      } catch {
        // 연결 실패·끊김 — 아래에서 재시도
      } finally {
        if (controller === current) controller = null;
        setConnected(false);
      }
      scheduleRetry();
    };

    const disconnect = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      controller?.abort();
      controller = null;
      setConnected(false);
    };

    void connect();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        delay = 1000;
        // 뒤에 있는 동안 놓친 신호는 react-query 포커스 새로고침(_layout의 focusManager)이 메움
        void connect();
      } else if (state === 'background') {
        disconnect();
      }
    });
    return () => {
      stopped = true;
      appState.remove();
      disconnect();
    };
  }, [token, audienceKey, queryClient]);
}
