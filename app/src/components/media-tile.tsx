import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
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
  /** 받는 동안 보여줄 흐린 미리보기(ThumbHash) */
  thumbhash?: string | null;
  /** 팬 채팅방이면 배우 id — 전체 화면에서 그 방의 사진·영상을 좌우로 넘겨 볼 수 있음 */
  actorId?: string;
  /** 모아보기 격자처럼 크기를 바깥에서 정할 때 */
  size?: { width: number; height: number; radius?: number };
}

/**
 * 말풍선 안의 사진/영상 — 누르면 전체 화면(확대·넘겨보기·저장). 영상은 첫 장면 사진(thumbnailUrl) 위에 ▶ + 길이 —
 * 썸네일이 없으면(예전 메시지, 캡처 실패) 어두운 타일로. 사진은 받는 동안 흐린 미리보기(thumbhash)를 먼저 그림.
 */
export function MediaTile({ id, url, mediaType, durationMs, thumbnailUrl, thumbhash, actorId, size }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const placeholder = thumbhash ? { thumbhash } : undefined;
  const open = () => {
    if (url) router.push({ pathname: '/media-viewer', params: { id, url, type: mediaType, ...(actorId ? { actorId } : {}), ...(thumbhash ? { thumbhash } : {}) } });
  };
  const box = size ? { width: size.width, height: size.height, borderRadius: size.radius ?? 0 } : undefined;
  return (
    <Pressable onPress={open} disabled={!url} accessibilityRole="imagebutton" accessibilityLabel={t('media.open')}>
      {mediaType === 'PHOTO' ? (
        <Image source={{ uri: url ?? undefined }} placeholder={placeholder} style={[styles.photo, box]} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.video, box]}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} placeholder={placeholder} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : null}
          <View style={[styles.playCircle, size && styles.playSmall]}>
            <Play size={size ? 14 : 20} color="#1E1F26" fill="#1E1F26" style={styles.playIcon} />
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
  // 2A 시안: 사진은 크고 깔끔한 카드(모서리 16), 영상도 같은 폭. 받기 전 빈 자리는 옅은 회색
  photo: { width: 240, height: 280, borderRadius: 16, backgroundColor: '#E9ECF3' },
  video: { width: 240, height: 180, borderRadius: 16, backgroundColor: '#1E1F26', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  playSmall: { width: 30, height: 30, borderRadius: 15 },
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
