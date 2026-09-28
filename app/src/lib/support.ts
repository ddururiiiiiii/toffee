import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

import i18n from '@/i18n';
import { SUPPORT_EMAIL } from '@/lib/env';

/**
 * 고객센터 메일 쓰기 — 운영자가 누구 문의인지 바로 찾을 수 있게 회원번호·앱 버전·기기를 본문 아래에 미리 넣음.
 * 문의 주소가 아직 없으면(EXPO_PUBLIC_SUPPORT_EMAIL 미설정) false.
 */
export async function openSupportMail(userId: string | undefined): Promise<boolean> {
  if (!SUPPORT_EMAIL) return false;
  const footer = [
    '',
    '',
    '----',
    `${i18n.t('support.accountId')}: ${userId ?? '-'}`,
    `${i18n.t('support.appVersion')}: ${Constants.expoConfig?.version ?? '-'} (${Platform.OS})`,
  ].join('\n');
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(i18n.t('support.subject'))}&body=${encodeURIComponent(footer)}`;
  await Linking.openURL(url);
  return true;
}
