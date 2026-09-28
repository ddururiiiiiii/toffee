import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { formatDuration } from '@/lib/waveform';

interface Props {
  id: string;
  url: string | null;
  mediaType: 'PHOTO' | 'VIDEO';
  durationMs?: number | null;
}

/**
 * 말풍선 안의 사진/영상 — 누르면 전체 화면(크게 보기·재생·저장). 영상은 썸네일이 아직 없어서
 * 어두운 타일 + ▶ + 길이로 표시(썸네일은 STATUS.md 후속 작업).
 */
export function MediaTile({ id, url, mediaType, durationMs }: Props) {
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
          <View style={styles.playCircle}>
            <ThemedText style={styles.playIcon}>▶</ThemedText>
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
  photo: { width: 200, height: 200, borderRadius: 10 },
  video: { width: 200, height: 150, borderRadius: 10, backgroundColor: '#1E1F26', alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#1E1F26', fontSize: 18, marginLeft: 3 },
  duration: { position: 'absolute', right: 8, bottom: 6, color: '#fff', fontSize: 12 },
});
