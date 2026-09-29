import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Compass, Image as ImageIcon, MessageCircle, Sparkle, type LucideIcon } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { SocialLoginButtons } from '@/components/social-login-buttons';
import type { SocialCredential } from '@/lib/social-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Radius, Spacing } from '@/constants/theme';

/**
 * 첫 화면 — 브랜드 보드의 스플래시(어두운 배경 + 흰 워드마크 + "Real people. Real messages. A closer world.")와
 * DESIGN_GUIDE §3 온보딩 목표: 배우를 찾고 → 구독하면 DM이 열리고 → 사진·음성·영상이 오고 → 유료라는 걸 한눈에.
 * 로그인: 소셜 로그인(키가 설정된 것만 — 앱은 애플·구글·LINE·카카오·네이버, PC 웹은 구글, 2026-09-29) + 개발용 이메일 로그인(개발 빌드나
 * EXPO_PUBLIC_ENABLE_DEV_LOGIN=true일 때만 — 운영 빌드엔 안 보임, 서버도 운영에선 막음).
 */
const SHOW_DEV_LOGIN = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, signedOutReason } = useAuth();
  const [email, setEmail] = useState('fan1@toffee.demo');

  const devLogin = useMutation({
    mutationFn: () => apiClient.post<{ accessToken: string }>('/auth/dev-login', { email }),
    onSuccess: (data) => login(data.accessToken),
  });
  // 소셜 로그인 — SDK에서 받은 토큰을 서버가 그 회사 API로 다시 확인하고 우리 로그인 토큰을 줌
  const [socialError, setSocialError] = useState<string | null>(null);
  const socialLogin = useMutation({
    mutationFn: (credential: SocialCredential) => apiClient.post<{ accessToken: string }>(`/auth/${credential.provider}`, credential.body),
    onSuccess: (data) => login(data.accessToken),
  });
  // mutate·setState는 렌더마다 같은 함수 — 웹 구글 버튼이 매번 다시 그려지지 않게 그대로 넘김
  const onCredential = socialLogin.mutate;
  const error = socialLogin.isError
    ? socialLogin.error instanceof ApiError
      ? socialLogin.error.message
      : t('login.failed')
    : devLogin.isError
      ? devLogin.error instanceof ApiError
        ? devLogin.error.message
        : t('login.failed')
      : (socialError ?? signedOutReason);

  const points: { icon: LucideIcon; text: string }[] = [
    { icon: Compass, text: t('welcome.discover') },
    { icon: MessageCircle, text: t('welcome.dm') },
    { icon: ImageIcon, text: t('welcome.media') },
  ];

  return (
    <View style={styles.root}>
      <Image source={require('@/../assets/brand/welcome-texture.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={['rgba(15,17,21,0.35)', 'rgba(15,17,21,0.85)', '#0F1115']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <Image source={require('@/../assets/brand/wordmark-white.png')} style={styles.wordmark} contentFit="contain" accessibilityLabel="Toffee" />
              <ThemedText type="display" style={styles.headline}>
                {t('welcome.headline')}
              </ThemedText>
              <View style={styles.points}>
                {points.map((point) => (
                  <View key={point.text} style={styles.point}>
                    <View style={styles.pointIcon}>
                      <Icon as={point.icon} size={18} color="#ffffff" />
                    </View>
                    <ThemedText style={styles.pointText}>{point.text}</ThemedText>
                  </View>
                ))}
              </View>
              <View style={styles.paid}>
                <Icon as={Sparkle} size={14} color="#7C8CFF" fill="#7C8CFF" />
                <ThemedText type="small" style={styles.paidText}>
                  {t('welcome.paid')}
                </ThemedText>
              </View>
            </View>

            <View style={styles.actions}>
              <SocialLoginButtons onCredential={onCredential} onError={setSocialError} busy={socialLogin.isPending} />
              {socialLogin.isPending ? (
                <ThemedText type="small" style={styles.cardHint}>
                  {t('login.signingIn')}
                </ThemedText>
              ) : null}
              {!SHOW_DEV_LOGIN && error ? (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              ) : null}
            </View>

            {SHOW_DEV_LOGIN ? (
            <View style={styles.card}>
              <ThemedText type="headline" style={styles.cardTitle}>
                {t('welcome.devTitle')}
              </ThemedText>
              <ThemedText type="small" style={styles.cardHint}>
                {t('welcome.devHint')}
              </ThemedText>
              <TextField
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                accessibilityLabel={t('welcome.email')}
                style={styles.cardInput}
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
              <Button
                title={t('welcome.continue')}
                variant="accent"
                loading={devLogin.isPending}
                disabled={!email.includes('@')}
                onPress={() => devLogin.mutate()}
              />
              {error ? (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              ) : null}
            </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1115' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'space-between', padding: Spacing.four, width: '100%', maxWidth: 520, alignSelf: 'center', gap: Spacing.five },
  hero: { paddingTop: Spacing.five, gap: Spacing.four },
  wordmark: { width: 150, height: 48 },
  headline: { color: '#ffffff', fontSize: 32, lineHeight: 42 },
  points: { gap: Spacing.three, marginTop: Spacing.two },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pointIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  pointText: { color: 'rgba(255,255,255,0.9)', flex: 1 },
  paid: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paidText: { color: 'rgba(255,255,255,0.6)' },
  actions: { gap: Spacing.two },
  card: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.xl, padding: Spacing.four, gap: Spacing.three },
  cardTitle: { color: '#ffffff' },
  cardHint: { color: 'rgba(255,255,255,0.6)', marginTop: -Spacing.two },
  cardInput: { backgroundColor: 'rgba(255,255,255,0.1)', color: '#ffffff' },
  error: { color: '#FF6369' },
});
