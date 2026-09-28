import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';

import { ThemedText } from '@/components/themed-text';
import { SavePermissionError, saveMedia } from '@/lib/save-media';
import { Spacing } from '@/constants/theme';

function VideoContent({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  // 열자마자 재생 — 만들 때 바로 play()하면 웹에선 영상 요소가 준비되기 전이라 무시돼서, 준비 완료 이벤트에서 한 번만
  useEffect(() => {
    let started = false;
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && !started) {
        started = true;
        player.play();
      }
    });
    return () => subscription.remove();
  }, [player]);
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls />;
}

// 사진 크게 보기 / 영상 재생 전체 화면(카톡처럼 검은 배경) + 저장 버튼.
// 채팅 말풍선에서 사진·영상을 누르면 열림 — url은 서버가 준 임시 서명 URL.
export default function MediaViewerScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id, url, type } = useLocalSearchParams<{ id: string; url: string; type: 'PHOTO' | 'VIDEO' }>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await saveMedia({ id, url, mediaType: type });
      setNotice(t('media.saved'));
    } catch (error) {
      setNotice(error instanceof SavePermissionError ? t('media.permissionDenied') : t('media.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
          <ThemedText style={styles.topText}>✕ {t('media.close')}</ThemedText>
        </Pressable>
        <Pressable onPress={save} disabled={saving || !url} hitSlop={12}>
          {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.topText}>⤓ {t('media.save')}</ThemedText>}
        </Pressable>
      </View>
      {url && type === 'VIDEO' ? (
        <VideoContent url={url} />
      ) : url ? (
        <Image source={{ uri: url }} style={styles.media} resizeMode="contain" />
      ) : null}
      {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  topText: { color: '#fff', fontWeight: '600' },
  media: { flex: 1, width: '100%' },
  notice: { color: '#fff', textAlign: 'center', padding: Spacing.three },
});
