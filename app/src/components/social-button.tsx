import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PROVIDER_STYLE } from '@/components/social-button-style';
import { SocialProviderIcon } from '@/components/social-provider-icon';
import type { SocialProvider } from '@/lib/social-types';

/**
 * 소셜 로그인 버튼 한 개(2026-10-02) — 웹은 구글 공식 버튼(Google Identity Services, 폭 320·높이 40·알약 모양, 왼쪽 G 로고)을
 * 바꿀 수 없어서 나머지 버튼을 그 모양에 맞춤. 앱도 같은 모양(알약 + 왼쪽 로고)으로, 폭만 화면에 맞춰 넓게.
 */
export function SocialButton({
  provider,
  label,
  onPress,
  disabled,
  loading,
}: {
  provider: SocialProvider;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const look = PROVIDER_STYLE[provider];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.background, opacity: pressed ? 0.85 : 1 },
        look.border ? { borderWidth: 1, borderColor: look.border } : null,
      ]}>
      {loading ? (
        <ActivityIndicator color={look.text} />
      ) : (
        <>
          <SocialProviderIcon provider={provider} color={look.text} />
          <ThemedText type="smallBold" style={[styles.label, { color: look.text }]} numberOfLines={1}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const WEB = Platform.OS === 'web';

const styles = StyleSheet.create({
  // 웹: 구글 공식 버튼과 같은 크기(320×40), 가운데. 앱: 폭 가득, 손가락으로 누르기 좋게 48
  button: {
    height: WEB ? 40 : 48,
    width: WEB ? 320 : undefined,
    maxWidth: '100%',
    alignSelf: WEB ? 'center' : 'stretch',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  label: { flexShrink: 1 },
});
