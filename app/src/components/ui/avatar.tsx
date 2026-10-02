import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { PersonFigure } from '@/components/ui/person-figure';
import { useTheme } from '@/hooks/use-theme';

/**
 * 원형 프로필 사진 — ring이면 B3 인박스처럼 라벤더 테두리(새 소식 강조), dot이면 오른쪽 아래 작은 점(안 읽음).
 * 사진이 없으면 사람 모양 기본 프로필(PersonFigure, 2026-10-02 — 예전엔 이름 첫 글자).
 */
export function Avatar({
  uri,
  size = 48,
  ring,
  dot,
  style,
}: {
  uri?: string | null;
  size?: number;
  ring?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const inner = ring ? size - 6 : size;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        ring && { borderWidth: 2, borderColor: theme.tint },
        style,
      ]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: theme.backgroundElement }} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}>
          <PersonFigure width={inner} />
        </View>
      )}
      {dot && (
        <View
          style={[
            styles.dot,
            { width: size * 0.26, height: size * 0.26, borderRadius: size * 0.13, backgroundColor: theme.tint, borderColor: theme.background },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { overflow: 'hidden' },
  dot: { position: 'absolute', right: 0, bottom: 0, borderWidth: 2 },
});
