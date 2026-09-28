import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth-context';
import { showInAppBanner } from '@/components/in-app-banner';
import {
  registerThisDevice,
  subscribeForegroundMessages,
  subscribeNotificationOpens,
  subscribeTokenRefresh,
  type PushData,
} from '@/lib/push';

/**
 * 로그인한 동안: 이 기기를 푸시 대상으로 등록 + 토큰 교체 감시 + 알림을 눌렀을 때 해당 화면으로 이동 +
 * 앱을 보고 있을 때 온 알림이면 그 대화를 새로 불러옴. 로그아웃 시 해제는 auth-context의 logout이 함.
 */
export function usePushNotifications(): void {
  const { token, role } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;
    registerThisDevice().catch(() => {});
    return subscribeTokenRefresh();
  }, [token]);

  useEffect(() => {
    if (!token || !role) return;
    // 역할마다 같은 배우의 다른 화면으로 — 팬은 채팅방, 소속사는 모니터링, 배우 본인은 스튜디오
    // 팬은 알림이 가리키는 메시지로 스크롤·강조(focus) — 인용 답장 알림이면 그 답장, 그 뒤에 새 메시지가 더 와도 찾아감
    const open = ({ actorId, messageId }: PushData) => {
      if (!actorId) return;
      if (role === 'AGENCY_STAFF') router.push(`/console/${actorId}`);
      else if (role === 'ACTOR') router.push(`/studio/${actorId}`);
      else if (role === 'USER') router.push({ pathname: '/chat/[actorId]', params: { actorId, ...(messageId ? { focus: messageId } : {}) } });
    };
    // 앱을 보고 있을 때 온 알림: 해당 대화·인박스를 새로 불러오고 위쪽 배너로 알려줌(누르면 그 대화로)
    const refresh = (data: PushData) => {
      if (!data.actorId) return;
      void queryClient.invalidateQueries({ queryKey: ['messages', data.actorId] });
      void queryClient.invalidateQueries({ queryKey: ['actor-broadcasts', data.actorId] });
      void queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
      if (data.title || data.body) showInAppBanner({ title: data.title, body: data.body, actorId: data.actorId, onPress: () => open(data) });
    };
    const unsubscribeOpens = subscribeNotificationOpens(open);
    const unsubscribeForeground = subscribeForegroundMessages(refresh);
    return () => {
      unsubscribeOpens();
      unsubscribeForeground();
    };
  }, [token, role, router, queryClient]);
}
