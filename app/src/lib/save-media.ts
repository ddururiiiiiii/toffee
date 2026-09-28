import { Alert, Platform } from 'react-native';

import i18n from '@/i18n';
import { loadPreference, savePreference } from '@/lib/preference-storage';

// expo-file-system / expo-media-library는 네이티브 객체를 상속하는 클래스를 import 시점에 만들어서,
// 웹(정적 렌더링 포함)에서 최상단 import하면 앱 전체가 "Class extends value undefined"로 죽음 —
// 네이티브 분기 안에서만 불러옴.

export type SaveResult = 'saved' | 'shared' | 'cancelled';

const NOTICE_ACK_KEY = 'toffee_save_notice_ack';

export class SavePermissionError extends Error {}

function fileName(id: string, url: string, mediaType: string): string {
  const extension = new URL(url).pathname.split('.').pop()?.toLowerCase();
  const fallback = mediaType === 'PHOTO' ? 'jpg' : mediaType === 'VIDEO' ? 'mp4' : 'm4a';
  return `toffee-${id}.${extension && extension.length <= 5 ? extension : fallback}`;
}

/**
 * 받은 사진·영상·음성을 기기에 저장.
 * - 웹: 파일을 받아서 브라우저 다운로드(저장소 버킷에 GET CORS 허용 필요 — ops-infra-backlog)
 * - 앱: 캐시에 받은 뒤 사진·영상은 사진 앱(갤러리)에 저장, 음성은 갤러리에 못 넣어서 공유 시트
 *   ("파일에 저장" 등)로 넘김
 * url은 서버가 권한 확인 후 준 임시 서명 URL이라 구독자만 받을 수 있음.
 */
/**
 * 처음 저장할 때 한 번만 "개인 소장용, 공유·유출 금지" 안내 후 동의를 받음(버블·위버스처럼 저장은 허용하되
 * 약관으로 유출 금지 — 2026-09-28 결정). 동의하면 이 기기에선 다시 묻지 않음.
 */
async function confirmPersonalUseOnce(): Promise<boolean> {
  if ((await loadPreference(NOTICE_ACK_KEY)) === 'yes') return true;
  const title = i18n.t('media.saveNoticeTitle');
  const body = i18n.t('media.saveNoticeBody');
  const agreed =
    Platform.OS === 'web'
      ? window.confirm(`${title}\n\n${body}`)
      : await new Promise<boolean>((resolve) =>
          Alert.alert(title, body, [
            { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: i18n.t('media.saveNoticeAgree'), onPress: () => resolve(true) },
          ]),
        );
  if (agreed) await savePreference(NOTICE_ACK_KEY, 'yes');
  return agreed;
}

export async function saveMedia(params: { id: string; url: string; mediaType: 'PHOTO' | 'AUDIO' | 'VIDEO' }): Promise<SaveResult> {
  if (!(await confirmPersonalUseOnce())) return 'cancelled';
  const name = fileName(params.id, params.url, params.mediaType);

  if (Platform.OS === 'web') {
    const blob = await (await fetch(params.url)).blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    return 'saved';
  }

  const [{ File, Paths }, MediaLibrary, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-media-library'),
    import('expo-sharing'),
  ]);
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(params.url, target);

  if (params.mediaType === 'AUDIO') {
    await Sharing.shareAsync(file.uri);
    return 'shared';
  }
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo', 'video']);
  if (!permission.granted) throw new SavePermissionError('media library permission denied');
  await MediaLibrary.Asset.create(file.uri);
  return 'saved';
}
