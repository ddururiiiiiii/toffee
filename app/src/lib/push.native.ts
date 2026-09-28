import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  type RemoteMessage,
} from '@react-native-firebase/messaging';

import i18n from '@/i18n';
import { apiClient } from '@/lib/api-client';

export interface PushData {
  type?: string;
  actorId?: string;
  messageId?: string;
}

// 로그아웃할 때 "이 기기"만 서버에서 떼어내려고 마지막으로 등록한 토큰을 기억해 둠
let registeredToken: string | null = null;

async function sendToServer(token: string): Promise<void> {
  registeredToken = token;
  await apiClient.put('/auth/me/push-devices', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
}

/**
 * 알림 권한을 요청하고 이 기기의 FCM 토큰을 서버에 등록. iOS도 @react-native-firebase를 거치면
 * APNs 토큰이 아니라 FCM 토큰을 받아서 서버(firebase-admin)가 두 플랫폼에 같은 방식으로 보냄.
 * 시뮬레이터·권한 거부면 조용히 건너뜀(알림만 안 올 뿐 앱은 정상).
 */
export async function registerThisDevice(): Promise<void> {
  if (!Device.isDevice) return;
  const messaging = getMessaging();
  const status = await requestPermission(messaging);
  if (status !== AuthorizationStatus.AUTHORIZED && status !== AuthorizationStatus.PROVISIONAL) return;
  if (Platform.OS === 'android') {
    // 서버가 android.notification.channelId = 'messages'로 보냄 — 이름은 설정 화면에 보이는 문구
    await Notifications.setNotificationChannelAsync('messages', {
      name: i18n.t('push.channelMessages'),
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await sendToServer(await getToken(messaging));
}

/** 로그아웃 직전에 호출(아직 로그인 토큰이 있을 때) — 이 기기만 해제, 다른 기기 알림은 유지 */
export async function unregisterThisDevice(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await apiClient.post('/auth/me/push-devices/remove', { token }).catch(() => {});
}

/** FCM이 세션 중간에 토큰을 바꾸면(앱 복원·만료 등) 다시 등록 — 안 하면 이 기기만 조용히 알림이 끊김 */
export function subscribeTokenRefresh(): () => void {
  return onTokenRefresh(getMessaging(), (token) => {
    void sendToServer(token).catch(() => {});
  });
}

function toPushData(message: RemoteMessage | null): PushData | null {
  const data = message?.data;
  if (!data) return null;
  const pick = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined);
  return { type: pick('type'), actorId: pick('actorId'), messageId: pick('messageId') };
}

/** 알림을 눌러 앱을 연 경우(백그라운드·완전 종료 둘 다) */
export function subscribeNotificationOpens(onOpen: (data: PushData) => void): () => void {
  const messaging = getMessaging();
  getInitialNotification(messaging)
    .then((message) => {
      const data = toPushData(message);
      if (data) onOpen(data);
    })
    .catch(() => {});
  return onNotificationOpenedApp(messaging, (message) => {
    const data = toPushData(message);
    if (data) onOpen(data);
  });
}

/** 앱을 보고 있는 중에 온 알림 — 배너 대신 화면 데이터를 새로 불러오는 데 씀 */
export function subscribeForegroundMessages(onMessageReceived: (data: PushData) => void): () => void {
  return onMessage(getMessaging(), (message) => {
    const data = toPushData(message);
    if (data) onMessageReceived(data);
  });
}
