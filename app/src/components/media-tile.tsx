import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { formatDuration } from '@/lib/waveform';

interface Props {
  id: string;
  url: string | null;
  mediaType: 'PHOTO' | 'VIDEO';
  durationMs?: number | null;
  /** 영상 첫 장면 사진(있으면 어두운 타일 대신 사진 위에 ▶) */
  thumbnailUrl?: string | null;
}

/**
 * 말풍선 안의 사진/영상 — 누르면 전체 화면(크게 보기·재생·저장). 영상은 첫 장면 사진(thumbnailUrl) 위에
 * ▶ + 길이로 표시 — 썸네일이 없으면(예전 메시지, 캡처 실패) 어두운 타일로.
 */
export function MediaTile({ id, url, mediaType, durationMs, thumbnailUrl }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const open = () => {
    if (url) router.push({ pathname: '/media-viewer', params: { id, url, type: mediaType } });
  };
  return (
    <Pressable onPress={open} disabled={!url} accessibilityRole="imagebutton" accessibilityLabel={t('media.open')}>
      {mediaType === 'PHOTO' ? (
        <Image source={{ uri: url ?? undefined }} style={styles.photo} />
      ) : (
        <View style={styles.video}>
          {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.playCircle}>
            <Play size={20} color="#1E1F26" fill="#1E1F26" style={styles.playIcon} />
          </View>
          {/* 웹 피커는 길이를 못 주는 경우가 있어서(0 또는 초 단위) 1초 미만이면 표시 안 함 */}
          {durationMs && durationMs >= 1000 ? (
            <ThemedText style={styles.duration}>{formatDuration(durationMs / 1000)}</ThemedText>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 2A 시안: 사진은 크고 깔끔한 카드(모서리 16), 영상도 같은 폭
  photo: { width: 240, height: 280, borderRadius: 16 },
  video: { width: 240, height: 180, borderRadius: 16, backgroundColor: '#1E1F26', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  playIcon: { marginLeft: 3 },
  // 밝은 썸네일 위에서도 읽히게 그림자(웹은 textShadow 한 줄 형식)
  duration: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    color: '#fff',
    fontSize: 12,
    ...Platform.select({
      web: { textShadow: '0 0 3px rgba(0,0,0,0.6)' },
      default: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
    }),
  },
});
